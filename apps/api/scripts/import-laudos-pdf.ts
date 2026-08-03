/**
 * Importa PDFs de laudos.
 *
 * Padrões aceitos:
 *   {tag|serie}_{CALIBRACAO|TSE|PREVENTIVA|QUALIFICACAO}_{YYYY-MM-DD}.pdf  (legado)
 *   {tag|serie}_{POP.EC.xxx}_{YYYY-MM-DD}.pdf                              (preferido)
 *
 * Se o PDF indicar "Em execução" / sem assinatura → ResultadoLaudo.PENDENTE_ASSINATURA
 * (não fecha o ciclo nem agenda próxima OS).
 *
 * Uso:
 *   pnpm exec tsx scripts/import-laudos-pdf.ts scripts/dados/laudos-desfibriladores
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import {
  PrismaClient,
  PrioridadeOS,
  ResultadoLaudo,
  StatusOS,
  TipoLaudo,
  TipoOS,
  TipoTestePlano,
} from "@prisma/client";
import {
  addMonths,
  agendarProximaOsPlano,
  tipoOsFromLaudo,
} from "../src/planos/proxima-os-plano";

const prisma = new PrismaClient();

const LEGACY_RE =
  /^(.+?)_(CALIBRACAO|TSE|PREVENTIVA|QUALIFICACAO)_(\d{4}-\d{2}-\d{2})\.pdf$/i;
const POP_RE = /^(.+?)_(POP\.EC\.[A-Z]+\.\d+)_(\d{4}-\d{2}-\d{2})\.pdf$/i;

const UNSIGNED_MARKERS = [
  /em\s*execu[cç][aã]o/i,
  /estado\s*:\s*em\s*execu/i,
  /status\s*:\s*em\s*execu/i,
  /pending\s*signature/i,
  /aguardando\s*assinatura/i,
];

function pdfPendenteAssinatura(buf: Buffer): boolean {
  // Texto literal costuma aparecer em PDFs gerados (sem decoder completo).
  const text = buf.toString("latin1");
  return UNSIGNED_MARKERS.some((re) => re.test(text));
}

function tipoLaudoFromTeste(t: TipoTestePlano | string): TipoLaudo {
  switch (t) {
    case TipoTestePlano.PREVENTIVA:
    case "PREVENTIVA":
      return TipoLaudo.PREVENTIVA;
    case TipoTestePlano.CALIBRACAO:
    case "CALIBRACAO":
      return TipoLaudo.CALIBRACAO;
    case TipoTestePlano.TSE:
    case "TSE":
      return TipoLaudo.TSE;
    case TipoTestePlano.QUALIFICACAO:
    case "QUALIFICACAO":
      return TipoLaudo.QUALIFICACAO;
    default:
      return TipoLaudo.CALIBRACAO;
  }
}

async function nextOsNumero(estabId: string) {
  const row = await prisma.contadorSequencia.upsert({
    where: { estabelecimentoId_chave: { estabelecimentoId: estabId, chave: "OS" } },
    create: { estabelecimentoId: estabId, chave: "OS", valor: 1 },
    update: { valor: { increment: 1 } },
  });
  return row.valor;
}

async function nextLaudoNumero(estabId: string, tipo: TipoLaudo) {
  const chave = `LAUDO_${tipo}`;
  const row = await prisma.contadorSequencia.upsert({
    where: { estabelecimentoId_chave: { estabelecimentoId: estabId, chave } },
    create: { estabelecimentoId: estabId, chave, valor: 1 },
    update: { valor: { increment: 1 } },
  });
  const prefix =
    tipo === TipoLaudo.CALIBRACAO
      ? "CAL"
      : tipo === TipoLaudo.TSE
        ? "TSE"
        : tipo === TipoLaudo.PREVENTIVA
          ? "PRV"
          : tipo === TipoLaudo.QUALIFICACAO
            ? "QLF"
            : tipo.slice(0, 3);
  return `${prefix}-${String(row.valor).padStart(4, "0")}`;
}

async function findEquipamento(estabId: string, chave: string) {
  const key = chave.trim();
  const byTag = await prisma.equipamento.findUnique({
    where: { estabelecimentoId_tag: { estabelecimentoId: estabId, tag: key } },
    include: { tipoEquipamentoPlano: { include: { testes: true } } },
  });
  if (byTag) return byTag;

  const bySerie = await prisma.equipamento.findFirst({
    where: { estabelecimentoId: estabId, nSerie: key },
    include: { tipoEquipamentoPlano: { include: { testes: true } } },
  });
  if (bySerie) return bySerie;

  return prisma.equipamento.findFirst({
    where: { estabelecimentoId: estabId, patrimonio: key },
    include: { tipoEquipamentoPlano: { include: { testes: true } } },
  });
}

async function main() {
  const dir = resolve(process.argv[2] ?? "scripts/dados/laudos-desfibriladores");
  if (!existsSync(dir)) {
    console.error(`Pasta não encontrada: ${dir}`);
    process.exit(1);
  }

  const estab = await prisma.estabelecimento.findFirst({ orderBy: { createdAt: "asc" } });
  if (!estab) {
    console.error("Nenhum estabelecimento. Rode o seed antes.");
    process.exit(1);
  }

  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  console.log(`[aion] laudos PDF: ${files.length} arquivo(s) em ${dir}`);
  console.log(`[aion] estabelecimento: ${estab.nome}`);

  let criados = 0;
  let pulados = 0;
  let pendentes = 0;
  const erros: string[] = [];
  const revisao: string[] = [];

  for (const file of files) {
    const popM = POP_RE.exec(file);
    const legM = !popM ? LEGACY_RE.exec(file) : null;
    if (!popM && !legM) {
      erros.push(`${file}: nome fora do padrão (tag_POP|TIPO_YYYY-MM-DD.pdf)`);
      continue;
    }

    const chave = (popM ?? legM)![1];
    const dataStr = (popM ?? legM)![3];
    const dataExecucao = new Date(`${dataStr}T12:00:00.000Z`);
    if (Number.isNaN(dataExecucao.getTime())) {
      erros.push(`${file}: data inválida`);
      continue;
    }

    try {
      const eq = await findEquipamento(estab.id, chave);
      if (!eq) {
        erros.push(`${file}: equipamento chave=${chave} não encontrado`);
        continue;
      }

      let planoTeste: {
        id: string;
        tipoTeste: TipoTestePlano;
        periodicidadeMeses: number;
        procedimentoCodigo: string;
        tipoEquipamentoPlanoId: string;
      } | null = null;

      if (popM) {
        const codigo = popM[2].toUpperCase();
        const candidatos = await prisma.planoTeste.findMany({
          where: {
            procedimentoCodigo: { equals: codigo, mode: "insensitive" },
            ativo: true,
            tipoEquipamentoPlano: { estabelecimentoId: estab.id },
          },
        });

        if (candidatos.length === 0) {
          revisao.push(`${file}: POP ${codigo} não encontrado no catálogo`);
          continue;
        }

        if (!eq.tipoEquipamentoPlanoId) {
          revisao.push(
            `${file}: equipamento ${eq.tag} sem plano vinculado — POP ${codigo} exige revisão`,
          );
          continue;
        }

        planoTeste =
          candidatos.find((c) => c.tipoEquipamentoPlanoId === eq.tipoEquipamentoPlanoId) ?? null;
        if (!planoTeste) {
          revisao.push(
            `${file}: POP ${codigo} não pertence ao plano do equipamento ${eq.tag} (${eq.tipoEquipamentoPlano?.nome ?? "?"})`,
          );
          continue;
        }
      } else if (legM) {
        const tipoStr = legM[2].toUpperCase() as TipoTestePlano | "CALIBRACAO" | "TSE";
        const tipoTeste =
          tipoStr === "TSE"
            ? TipoTestePlano.TSE
            : tipoStr === "PREVENTIVA"
              ? TipoTestePlano.PREVENTIVA
              : tipoStr === "QUALIFICACAO"
                ? TipoTestePlano.QUALIFICACAO
                : TipoTestePlano.CALIBRACAO;

        if (eq.tipoEquipamentoPlanoId) {
          planoTeste =
            (await prisma.planoTeste.findUnique({
              where: {
                tipoEquipamentoPlanoId_tipoTeste: {
                  tipoEquipamentoPlanoId: eq.tipoEquipamentoPlanoId,
                  tipoTeste,
                },
              },
            })) ?? null;
        }
      }

      const tipoLaudo = planoTeste
        ? tipoLaudoFromTeste(planoTeste.tipoTeste)
        : tipoLaudoFromTeste((legM?.[2] ?? "CALIBRACAO").toUpperCase());
      const tipoOs = tipoOsFromLaudo(tipoLaudo);
      const pdf = readFileSync(join(dir, file));
      const pendente = pdfPendenteAssinatura(pdf);
      const resultado = pendente ? ResultadoLaudo.PENDENTE_ASSINATURA : ResultadoLaudo.APROVADO;
      if (pendente) pendentes += 1;

      const validadeMeses = planoTeste?.periodicidadeMeses ?? 12;
      const validadeAte = addMonths(dataExecucao, validadeMeses);

      const existente = await prisma.laudo.findFirst({
        where: {
          estabelecimentoId: estab.id,
          equipamentoId: eq.id,
          tipo: tipoLaudo,
          dataExecucao,
        },
        include: { anexos: { select: { id: true, nomeArquivo: true } } },
      });

      if (existente?.anexos.some((a) => a.nomeArquivo === file)) {
        pulados += 1;
        continue;
      }

      let laudoId = existente?.id;
      let osNumero = existente?.osNumero ?? null;

      if (!existente) {
        osNumero = await nextOsNumero(estab.id);
        await prisma.ordemServico.create({
          data: {
            estabelecimentoId: estab.id,
            numero: osNumero,
            codigo: `OS-${String(osNumero).padStart(4, "0")}`,
            equipamentoId: eq.id,
            tipo: tipoOs as TipoOS,
            prioridade: PrioridadeOS.MEDIA,
            status: pendente ? StatusOS.EM_ANDAMENTO : StatusOS.CONCLUIDA,
            abertura: dataExecucao,
            fechamento: pendente ? null : dataExecucao,
            pendencia: pendente ? "Aguardando assinatura do laudo PDF" : null,
            observacaoRequisicao: `Importação PDF ${file}`,
          },
        });

        const numero = await nextLaudoNumero(estab.id, tipoLaudo);
        const laudo = await prisma.laudo.create({
          data: {
            estabelecimentoId: estab.id,
            tipo: tipoLaudo,
            numero,
            equipamentoId: eq.id,
            osNumero,
            dataExecucao,
            tecnicoNome: "Importação PDF",
            resultado,
            validadeMeses,
            validadeAte: pendente ? null : validadeAte,
            planoTesteId: planoTeste?.id ?? null,
            respostas: [],
            metadados: {
              origem: "import_laudos_pdf",
              arquivoOriginal: file,
              procedimentoCodigo: planoTeste?.procedimentoCodigo ?? null,
              pendenteAssinatura: pendente,
            },
          },
        });
        laudoId = laudo.id;

        if (!pendente && planoTeste) {
          await agendarProximaOsPlano(prisma, {
            estabelecimentoId: estab.id,
            equipamentoId: eq.id,
            tipo: tipoLaudo,
            dataExecucao,
            periodicidadeMeses: planoTeste.periodicidadeMeses,
            resultado,
            observacao: `Próxima ${tipoLaudo} · ${planoTeste.procedimentoCodigo}`,
          });
        }
      } else if (existente && !pendente && existente.resultado === ResultadoLaudo.PENDENTE_ASSINATURA) {
        await prisma.laudo.update({
          where: { id: existente.id },
          data: {
            resultado: ResultadoLaudo.APROVADO,
            validadeMeses,
            validadeAte,
            planoTesteId: planoTeste?.id ?? existente.planoTesteId,
          },
        });
        if (planoTeste) {
          await agendarProximaOsPlano(prisma, {
            estabelecimentoId: estab.id,
            equipamentoId: eq.id,
            tipo: tipoLaudo,
            dataExecucao,
            periodicidadeMeses: planoTeste.periodicidadeMeses,
            resultado: ResultadoLaudo.APROVADO,
            observacao: `Próxima ${tipoLaudo} · ${planoTeste.procedimentoCodigo}`,
          });
        }
      }

      if (!laudoId) throw new Error("laudoId ausente");

      await prisma.laudoAnexo.create({
        data: {
          laudoId,
          nomeArquivo: file,
          mimeType: "application/pdf",
          conteudo: pdf,
        },
      });

      criados += 1;
      console.log(
        `[aion] OK ${file} → tag ${eq.tag} · OS-${osNumero} · ${resultado}${
          planoTeste ? ` · ${planoTeste.procedimentoCodigo}` : ""
        }`,
      );
    } catch (e) {
      erros.push(`${file}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        pasta: basename(dir),
        arquivos: files.length,
        anexosCriados: criados,
        pulados,
        pendenteAssinatura: pendentes,
        revisaoManual: revisao.length,
        erros: erros.length,
        detalhesRevisao: revisao,
        detalhesErros: erros,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
