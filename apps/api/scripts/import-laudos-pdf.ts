/**
 * Importa PDFs de laudos: {tag}_{CALIBRACAO|TSE}_{YYYY-MM-DD}.pdf
 *
 * Para cada arquivo:
 *  - localiza equipamento pela tag
 *  - cria OS CONCLUIDA (tipo CALIBRACAO/TSE)
 *  - cria Laudo APROVADO com validade +12 meses
 *  - grava PDF em LaudoAnexo
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
} from "@prisma/client";

const prisma = new PrismaClient();

const FILE_RE = /^(.+?)_(CALIBRACAO|TSE)_(\d{4}-\d{2}-\d{2})\.pdf$/i;

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
  const prefix = tipo === TipoLaudo.CALIBRACAO ? "CAL" : "TSE";
  return `${prefix}-${String(row.valor).padStart(4, "0")}`;
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
  console.log(`[nexo] laudos PDF: ${files.length} arquivo(s) em ${dir}`);
  console.log(`[nexo] estabelecimento: ${estab.nome}`);

  let criados = 0;
  let pulados = 0;
  const erros: string[] = [];

  for (const file of files) {
    const m = FILE_RE.exec(file);
    if (!m) {
      erros.push(`${file}: nome fora do padrão tag_TIPO_YYYY-MM-DD.pdf`);
      continue;
    }
    const tag = m[1];
    const tipoStr = m[2].toUpperCase() as "CALIBRACAO" | "TSE";
    const dataStr = m[3];
    const dataExecucao = new Date(`${dataStr}T12:00:00.000Z`);
    if (Number.isNaN(dataExecucao.getTime())) {
      erros.push(`${file}: data inválida`);
      continue;
    }

    const tipoLaudo = tipoStr === "TSE" ? TipoLaudo.TSE : TipoLaudo.CALIBRACAO;
    const tipoOs = tipoStr === "TSE" ? TipoOS.TSE : TipoOS.CALIBRACAO;

    try {
      const eq = await prisma.equipamento.findUnique({
        where: {
          estabelecimentoId_tag: { estabelecimentoId: estab.id, tag },
        },
      });
      if (!eq) {
        erros.push(`${file}: equipamento tag=${tag} não encontrado`);
        continue;
      }

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

      const validadeAte = new Date(dataExecucao);
      validadeAte.setMonth(validadeAte.getMonth() + 12);
      const pdf = readFileSync(join(dir, file));

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
            tipo: tipoOs,
            prioridade: PrioridadeOS.MEDIA,
            status: StatusOS.CONCLUIDA,
            abertura: dataExecucao,
            fechamento: dataExecucao,
            pendencia: null,
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
            resultado: ResultadoLaudo.APROVADO,
            validadeMeses: 12,
            validadeAte,
            respostas: [],
            metadados: {
              origem: "import_laudos_pdf",
              arquivoOriginal: file,
            },
          },
        });
        laudoId = laudo.id;
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
      console.log(`[nexo] OK ${file} → tag ${tag} · OS-${osNumero} · laudo ${laudoId}`);
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
        erros: erros.length,
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
