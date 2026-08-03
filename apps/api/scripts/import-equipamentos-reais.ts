/**
 * Importa equipamentos reais a partir de JSON (schema em docs/import-equipamentos-reais.md).
 *
 * Uso:
 *   pnpm exec tsx scripts/import-equipamentos-reais.ts scripts/dados/equipamentos-reais.json
 *   pnpm exec tsx scripts/import-equipamentos-reais.ts scripts/dados/equipamentos-reais.json --estab estab_modelo
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import {
  PrismaClient,
  ResultadoLaudo,
  SituacaoEquipamento,
  TipoLaudo,
} from "@prisma/client";

const prisma = new PrismaClient();

type LaudoIn = {
  tipo: "CALIBRACAO" | "TSE";
  dataExecucao?: string | null;
  validadeAte?: string | null;
  resultado?: "APROVADO" | "REPROVADO" | "APROVADO_COM_RESSALVAS";
  pdfArquivo?: string | null;
};

type EqIn = {
  tag: string;
  nome: string;
  planoDescricao: string;
  fabricante: string;
  modelo: string;
  setor: string;
  patrimonio?: string | null;
  nSerie?: string | null;
  registroAnvisa?: string | null;
  validadeAnvisa?: string | null;
  dataAquisicao?: string | null;
  dataInstalacao?: string | null;
  valorAquisicao?: number | null;
  situacao?: string | null;
  observacao?: string | null;
  laudos?: LaudoIn[];
};

type Payload = {
  meta?: { fonte?: string; avisos?: string[] };
  equipamentos: EqIn[];
};

function parseDate(v?: string | null): Date | null {
  if (!v || !String(v).trim()) return null;
  const d = new Date(String(v).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function situacaoOf(v?: string | null): SituacaoEquipamento {
  const s = String(v ?? "ATIVO").toUpperCase();
  if (s in SituacaoEquipamento) return s as SituacaoEquipamento;
  return SituacaoEquipamento.ATIVO;
}

async function upsertPlano(estabId: string, nome: string) {
  const n = nome.trim() || "Outros";
  return prisma.planoDescricao.upsert({
    where: { estabelecimentoId_nome: { estabelecimentoId: estabId, nome: n } },
    update: {},
    create: { estabelecimentoId: estabId, nome: n, vidaUtilAnos: 10 },
  });
}

async function upsertSetor(estabId: string, nome: string) {
  const n = nome.trim() || "Geral";
  return prisma.setor.upsert({
    where: { estabelecimentoId_nome: { estabelecimentoId: estabId, nome: n } },
    update: {},
    create: { estabelecimentoId: estabId, nome: n },
  });
}

async function upsertFabricante(estabId: string, nome: string) {
  const n = nome.trim() || "Não informado";
  return prisma.fabricante.upsert({
    where: { estabelecimentoId_nome: { estabelecimentoId: estabId, nome: n } },
    update: {},
    create: { estabelecimentoId: estabId, nome: n },
  });
}

async function upsertModelo(fabricanteId: string, nome: string) {
  const n = nome.trim() || "Não informado";
  return prisma.modelo.upsert({
    where: { fabricanteId_nome: { fabricanteId, nome: n } },
    update: {},
    create: { fabricanteId, nome: n },
  });
}

async function nextLaudoNumero(estabId: string, tipo: TipoLaudo) {
  const chave = `LAUDO_${tipo}`;
  const row = await prisma.contadorSequencia.upsert({
    where: { estabelecimentoId_chave: { estabelecimentoId: estabId, chave } },
    create: { estabelecimentoId: estabId, chave, valor: 1 },
    update: { valor: { increment: 1 } },
  });
  const prefix =
    tipo === TipoLaudo.CALIBRACAO ? "CAL" : tipo === TipoLaudo.TSE ? "TSE" : tipo.slice(0, 3);
  return `${prefix}-${String(row.valor).padStart(4, "0")}`;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const estabFlag = process.argv.indexOf("--estab");
  const estabIdArg = estabFlag >= 0 ? process.argv[estabFlag + 1] : undefined;

  const file = resolve(args[0] ?? "scripts/dados/equipamentos-exemplo.json");
  if (!existsSync(file)) {
    console.error(`Arquivo não encontrado: ${file}`);
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(file, "utf8")) as Payload;
  if (!Array.isArray(payload.equipamentos) || payload.equipamentos.length === 0) {
    console.error("JSON sem equipamentos[]");
    process.exit(1);
  }

  const estab =
    (estabIdArg
      ? await prisma.estabelecimento.findUnique({ where: { id: estabIdArg } })
      : null) ?? (await prisma.estabelecimento.findFirst({ orderBy: { createdAt: "asc" } }));

  if (!estab) {
    console.error("Nenhum estabelecimento. Rode o seed antes.");
    process.exit(1);
  }

  console.log(`Estabelecimento: ${estab.nome} (${estab.id})`);
  console.log(`Fonte: ${payload.meta?.fonte ?? basename(file)}`);
  if (payload.meta?.avisos?.length) {
    console.log("Avisos da extração:", payload.meta.avisos.join(" | "));
  }

  const planoCache = new Map<string, Awaited<ReturnType<typeof upsertPlano>>>();
  const setorCache = new Map<string, Awaited<ReturnType<typeof upsertSetor>>>();
  const fabCache = new Map<string, Awaited<ReturnType<typeof upsertFabricante>>>();
  const modeloCache = new Map<string, Awaited<ReturnType<typeof upsertModelo>>>();

  async function planoCached(nome?: string | null) {
    const k = (nome || "Outros").trim() || "Outros";
    if (!planoCache.has(k)) planoCache.set(k, await upsertPlano(estab!.id, k));
    return planoCache.get(k)!;
  }
  async function setorCached(nome?: string | null) {
    const k = (nome || "Não informado").trim() || "Não informado";
    if (!setorCache.has(k)) setorCache.set(k, await upsertSetor(estab!.id, k));
    return setorCache.get(k)!;
  }
  async function fabCached(nome?: string | null) {
    const k = (nome || "Não informado").trim() || "Não informado";
    if (!fabCache.has(k)) fabCache.set(k, await upsertFabricante(estab!.id, k));
    return fabCache.get(k)!;
  }
  async function modeloCached(fabId: string, nome?: string | null) {
    const n = (nome || "Não informado").trim() || "Não informado";
    const k = `${fabId}::${n}`;
    if (!modeloCache.has(k)) modeloCache.set(k, await upsertModelo(fabId, n));
    return modeloCache.get(k)!;
  }

  let ok = 0;
  let upd = 0;
  let laudosCriados = 0;
  let processed = 0;
  const erros: string[] = [];
  const pdfsPendentes: string[] = [];
  const total = payload.equipamentos.length;

  for (const row of payload.equipamentos) {
    const tag = String(row.tag ?? "").trim();
    processed += 1;
    try {
      if (!tag || !row.nome?.trim()) throw new Error("tag/nome obrigatórios");

      const [plano, setor, fab] = await Promise.all([
        planoCached(row.planoDescricao),
        setorCached(row.setor),
        fabCached(row.fabricante),
      ]);
      const modelo = await modeloCached(fab.id, row.modelo);

      const obsParts = [
        row.observacao?.trim() || null,
        row.laudos
          ?.filter((l) => l.pdfArquivo)
          .map((l) => `PDF ${l.tipo}: ${l.pdfArquivo}`)
          .join("; ") || null,
      ].filter(Boolean);

      const data = {
        nome: row.nome.trim(),
        descricaoId: plano.id,
        fabricanteId: fab.id,
        modeloId: modelo.id,
        setorId: setor.id,
        patrimonio: row.patrimonio?.trim() || null,
        nSerie: row.nSerie?.trim() || null,
        registroAnvisa: row.registroAnvisa?.trim() || null,
        validadeAnvisa: parseDate(row.validadeAnvisa),
        dataAquisicao: parseDate(row.dataAquisicao),
        dataInstalacao: parseDate(row.dataInstalacao),
        valorAquisicao: row.valorAquisicao != null ? row.valorAquisicao : null,
        situacao: situacaoOf(row.situacao),
        observacao: obsParts.length ? obsParts.join(" · ") : null,
        checklistRecebimentoPendente: false,
      };

      const existing = await prisma.equipamento.findUnique({
        where: { estabelecimentoId_tag: { estabelecimentoId: estab.id, tag } },
      });

      const eq = existing
        ? await prisma.equipamento.update({ where: { id: existing.id }, data })
        : await prisma.equipamento.create({
            data: { estabelecimentoId: estab.id, tag, ...data },
          });

      if (existing) upd += 1;
      else ok += 1;

      for (const l of row.laudos ?? []) {
        const tipo = l.tipo === "TSE" ? TipoLaudo.TSE : TipoLaudo.CALIBRACAO;
        const dataExecucao = parseDate(l.dataExecucao) ?? new Date();
        let validadeAte = parseDate(l.validadeAte);
        if (!validadeAte) {
          validadeAte = new Date(dataExecucao);
          validadeAte.setMonth(validadeAte.getMonth() + 12);
        }
        const resultado =
          (l.resultado as ResultadoLaudo | undefined) ?? ResultadoLaudo.APROVADO;

        const jaExiste = await prisma.laudo.findFirst({
          where: {
            estabelecimentoId: estab.id,
            equipamentoId: eq.id,
            tipo,
            dataExecucao,
          },
        });
        if (jaExiste) continue;

        const numero = await nextLaudoNumero(estab.id, tipo);
        await prisma.laudo.create({
          data: {
            estabelecimentoId: estab.id,
            tipo,
            numero,
            equipamentoId: eq.id,
            dataExecucao,
            validadeMeses: 12,
            validadeAte,
            resultado,
            tecnicoNome: "Importação real",
            respostas: [],
            metadados: {
              origem: "import_equipamentos_reais",
              pdfArquivo: l.pdfArquivo ?? null,
            },
          },
        });
        laudosCriados += 1;
        if (l.pdfArquivo) pdfsPendentes.push(`${tag} · ${l.tipo} · ${l.pdfArquivo}`);
      }
    } catch (e) {
      erros.push(`${tag || "?"}: ${e instanceof Error ? e.message : e}`);
    }

    if (processed % 25 === 0 || processed === total) {
      console.log(
        `[nexo] import progresso ${processed}/${total} (criados=${ok} upd=${upd} erros=${erros.length})`,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        criados: ok,
        atualizados: upd,
        laudosCriados,
        erros: erros.length,
        detalhesErros: erros.slice(0, 30),
        pdfsPendentesUpload: pdfsPendentes.slice(0, 30),
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
