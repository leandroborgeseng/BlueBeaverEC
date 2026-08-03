/**
 * Seed do catálogo de planos de manutenção + vínculo nos equipamentos (v2).
 *
 * Uso:
 *   pnpm exec tsx scripts/import-planos-manutencao.ts
 *   pnpm exec tsx scripts/import-planos-manutencao.ts --force
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient, TipoTestePlano } from "@prisma/client";

const prisma = new PrismaClient();

type BlocoPreventiva = { periodicidade?: string; procedimento?: string } | null;
type BlocoCalibracao = {
  periodicidade?: string;
  parametrosFaixa?: string;
  tolerancias?: string;
  procedimento?: string;
} | null;
type BlocoTse = {
  periodicidade?: string;
  classe?: string;
  tipo?: string;
  pontoAplicacao?: string;
  procedimento?: string;
} | null;
type BlocoQual = { periodicidade?: string; procedimento?: string } | null;

type PlanoRef = {
  equipamento: string;
  preventiva: BlocoPreventiva;
  calibracao: BlocoCalibracao;
  segurancaEletrica: BlocoTse;
  qualificacao: BlocoQual;
};

type PlanoMatch = {
  tipoMatch: "exato" | "aproximado" | "sem_correspondencia" | string;
  equipamentoPlanilha?: string | null;
  observacao?: string | null;
  plano?: PlanoRef | null;
};

type EqV2 = {
  tag: string;
  planoManutencao?: PlanoMatch | null;
};

function parseMeses(texto?: string | null): number | null {
  if (!texto) return null;
  const m = String(texto).match(/(\d+)\s*mes/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function upsertTeste(
  tipoId: string,
  tipoTeste: TipoTestePlano,
  bloco: Record<string, unknown> | null | undefined,
  extra: {
    parametrosFaixa?: string | null;
    tolerancias?: string | null;
    classeTse?: string | null;
    tipoParteAplicada?: string | null;
    pontoAplicacao?: string | null;
  } = {},
) {
  if (!bloco) return;
  const procedimento = String(bloco.procedimento ?? "").trim();
  const meses = parseMeses(String(bloco.periodicidade ?? ""));
  if (!procedimento || !meses) return;

  await prisma.planoTeste.upsert({
    where: {
      tipoEquipamentoPlanoId_tipoTeste: {
        tipoEquipamentoPlanoId: tipoId,
        tipoTeste,
      },
    },
    update: {
      periodicidadeMeses: meses,
      procedimentoCodigo: procedimento,
      parametrosFaixa: extra.parametrosFaixa ?? null,
      tolerancias: extra.tolerancias ?? null,
      classeTse: extra.classeTse ?? null,
      tipoParteAplicada: extra.tipoParteAplicada ?? null,
      pontoAplicacao: extra.pontoAplicacao ?? null,
      ativo: true,
    },
    create: {
      tipoEquipamentoPlanoId: tipoId,
      tipoTeste,
      periodicidadeMeses: meses,
      procedimentoCodigo: procedimento,
      parametrosFaixa: extra.parametrosFaixa ?? null,
      tolerancias: extra.tolerancias ?? null,
      classeTse: extra.classeTse ?? null,
      tipoParteAplicada: extra.tipoParteAplicada ?? null,
      pontoAplicacao: extra.pontoAplicacao ?? null,
    },
  });
}

async function main() {
  const force = process.argv.includes("--force");
  const refFile = resolve(
    process.argv.find((a) => a.endsWith(".json") && a.includes("planos")) ??
      "scripts/dados/planos_manutencao_referencia.json",
  );
  const v2File = resolve("scripts/dados/aion_extract_v2.json");

  if (!existsSync(refFile)) {
    console.error(`Catálogo não encontrado: ${refFile}`);
    process.exit(1);
  }
  if (!existsSync(v2File)) {
    console.error(`aion_extract_v2.json não encontrado: ${v2File}`);
    process.exit(1);
  }

  const estab = await prisma.estabelecimento.findFirst({ orderBy: { createdAt: "asc" } });
  if (!estab) {
    console.error("Nenhum estabelecimento. Rode o seed antes.");
    process.exit(1);
  }

  const existentes = await prisma.tipoEquipamentoPlano.count({
    where: { estabelecimentoId: estab.id },
  });
  if (!force && existentes >= 131) {
    const vinculados = await prisma.equipamento.count({
      where: { estabelecimentoId: estab.id, tipoEquipamentoPlanoId: { not: null } },
    });
    if (vinculados > 0) {
      console.log(
        `[aion] planos: catálogo já seedado (${existentes} tipos, ${vinculados} eq vinculados) — skip (use --force)`,
      );
      return;
    }
  }

  const catalogo = JSON.parse(readFileSync(refFile, "utf8")) as PlanoRef[];
  console.log(`[aion] planos: seed ${catalogo.length} tipos · estab=${estab.nome}`);

  let tipos = 0;

  for (const item of catalogo) {
    const nome = String(item.equipamento ?? "").trim();
    if (!nome) continue;

    const tipo = await prisma.tipoEquipamentoPlano.upsert({
      where: {
        estabelecimentoId_nome: { estabelecimentoId: estab.id, nome },
      },
      update: { ativo: true },
      create: { estabelecimentoId: estab.id, nome },
    });
    tipos += 1;

    await upsertTeste(tipo.id, TipoTestePlano.PREVENTIVA, item.preventiva as Record<string, unknown> | null);
    await upsertTeste(tipo.id, TipoTestePlano.CALIBRACAO, item.calibracao as Record<string, unknown> | null, {
      parametrosFaixa: item.calibracao?.parametrosFaixa,
      tolerancias: item.calibracao?.tolerancias,
    });
    await upsertTeste(tipo.id, TipoTestePlano.TSE, item.segurancaEletrica as Record<string, unknown> | null, {
      classeTse: item.segurancaEletrica?.classe,
      tipoParteAplicada: item.segurancaEletrica?.tipo,
      pontoAplicacao: item.segurancaEletrica?.pontoAplicacao,
    });
    await upsertTeste(tipo.id, TipoTestePlano.QUALIFICACAO, item.qualificacao as Record<string, unknown> | null);
  }

  const totalTestes = await prisma.planoTeste.count({
    where: { tipoEquipamentoPlano: { estabelecimentoId: estab.id } },
  });

  const v2 = JSON.parse(readFileSync(v2File, "utf8")) as {
    meta?: { avisos?: string[] };
    equipamentos: EqV2[];
  };

  const tiposByNome = new Map(
    (
      await prisma.tipoEquipamentoPlano.findMany({
        where: { estabelecimentoId: estab.id },
        select: { id: true, nome: true },
      })
    ).map((t) => [t.nome, t.id]),
  );

  let vinculados = 0;
  let semPlano = 0;
  let naoEncontrados = 0;
  let tipoAusente = 0;

  for (const eq of v2.equipamentos ?? []) {
    const tag = String(eq.tag ?? "").trim();
    if (!tag) continue;

    const match = eq.planoManutencao;
    const tipoMatch = match?.tipoMatch ?? "sem_correspondencia";
    const obs = match?.observacao ?? null;

    let tipoId: string | null = null;
    if (tipoMatch !== "sem_correspondencia" && match?.plano?.equipamento) {
      tipoId = tiposByNome.get(match.plano.equipamento) ?? null;
      if (!tipoId && match.equipamentoPlanilha) {
        tipoId = tiposByNome.get(match.equipamentoPlanilha) ?? null;
      }
      if (!tipoId) tipoAusente += 1;
    } else {
      semPlano += 1;
    }

    const updated = await prisma.equipamento.updateMany({
      where: { estabelecimentoId: estab.id, tag },
      data: {
        tipoEquipamentoPlanoId: tipoId,
        planoMatchTipo: tipoMatch,
        planoMatchObs: obs,
      },
    });

    if (updated.count === 0) {
      naoEncontrados += 1;
      continue;
    }
    if (tipoId) vinculados += 1;
  }

  console.log(
    JSON.stringify(
      {
        tiposCatalogo: tipos,
        planoTestes: totalTestes,
        equipamentosVinculados: vinculados,
        semCorrespondencia: semPlano,
        tagsNaoNoBanco: naoEncontrados,
        nomePlanoAusenteNoCatalogo: tipoAusente,
        avisosMeta: v2.meta?.avisos?.length ?? 0,
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
