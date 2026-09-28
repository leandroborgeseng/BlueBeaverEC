/**
 * Recodifica TAG do parque para HEF-{sigla}-{seq} por setor funcional.
 * Não apaga equipamento. Idempotente: se a TAG já é a destino, não mexe.
 *
 * Uso: pnpm exec tsx scripts/recodificar-tags-setor.ts
 */
import { PrismaClient } from "@prisma/client";
import { MAPEAMENTO_LOCALIZACAO_SETOR, SIGLAS_SETORES } from "../src/cadastros/setor-area-mapeamento";
import { normalizarSigla } from "../src/equipamentos/equipamento-regras";

const prisma = new PrismaClient();
const JUSTIFICATIVA = "Recodificação TAG por setor funcional";
const ADMIN_EMAIL = "leandro.borges@aion.eng.br";

function tagDestino(sigla: string, n: number) {
  const width = Math.max(3, String(n).length);
  return `HEF-${sigla}-${String(n).padStart(width, "0")}`;
}

function chaveOrdem(tag: string, createdAt: Date): [number, number] {
  const inst = /^HEF-(\d+)$/i.exec(tag.trim());
  if (inst) return [0, Number(inst[1])];
  const set = /^HEF-[A-Z0-9]+-(\d+)$/i.exec(tag.trim());
  if (set) return [1, Number(set[1])];
  return [2, createdAt.getTime()];
}

async function garantirSiglasEMapeamento(estabelecimentoId: string) {
  for (const nome of [...new Set(MAPEAMENTO_LOCALIZACAO_SETOR.map((m) => m.setor))]) {
    const sigla = SIGLAS_SETORES[nome] ?? null;
    const row = await prisma.setorArea.upsert({
      where: { estabelecimentoId_nome: { estabelecimentoId, nome } },
      update: {},
      create: { estabelecimentoId, nome, sigla },
    });
    if (sigla && !row.sigla) {
      await prisma.setorArea.update({ where: { id: row.id }, data: { sigla } });
    }
  }

  const localizacoes = await prisma.setor.findMany({
    where: { estabelecimentoId },
    select: { id: true, nome: true, setorAreaId: true },
  });
  const porNome = new Map(localizacoes.map((l) => [l.nome, l]));
  const areas = await prisma.setorArea.findMany({
    where: { estabelecimentoId },
    select: { id: true, nome: true },
  });
  const areaPorNome = new Map(areas.map((a) => [a.nome, a.id]));

  for (const m of MAPEAMENTO_LOCALIZACAO_SETOR) {
    const loc = porNome.get(m.localizacao);
    const areaId = areaPorNome.get(m.setor);
    if (!loc || !areaId || loc.setorAreaId) continue;
    await prisma.setor.update({ where: { id: loc.id }, data: { setorAreaId: areaId } });
  }
}

async function usuarioHistorico() {
  const admin = await prisma.usuario.findFirst({ where: { email: ADMIN_EMAIL, ativo: true } });
  if (admin) return admin.id;
  const qualquer = await prisma.usuario.findFirst({ where: { ativo: true }, orderBy: { createdAt: "asc" } });
  if (!qualquer) throw new Error("Nenhum usuário para gravar histórico de TAG");
  return qualquer.id;
}

async function recodificarEstabelecimento(estabelecimentoId: string, usuarioId: string) {
  await garantirSiglasEMapeamento(estabelecimentoId);

  const eqs = await prisma.equipamento.findMany({
    where: { estabelecimentoId },
    select: {
      id: true,
      tag: true,
      createdAt: true,
      setor: { select: { nome: true, setorArea: { select: { sigla: true, nome: true } } } },
    },
  });

  const comSigla: Array<{ id: string; tag: string; createdAt: Date; sigla: string }> = [];
  const semSetor: string[] = [];
  for (const eq of eqs) {
    const sigla = normalizarSigla(eq.setor.setorArea?.sigla);
    if (!sigla) {
      semSetor.push(`${eq.tag} (${eq.setor.nome})`);
      continue;
    }
    comSigla.push({ id: eq.id, tag: eq.tag, createdAt: eq.createdAt, sigla });
  }

  const porSigla = new Map<string, typeof comSigla>();
  for (const eq of comSigla) {
    const lista = porSigla.get(eq.sigla) ?? [];
    lista.push(eq);
    porSigla.set(eq.sigla, lista);
  }

  const plano: Array<{ id: string; de: string; para: string }> = [];
  for (const [sigla, lista] of porSigla) {
    lista.sort((a, b) => {
      const [fa, na] = chaveOrdem(a.tag, a.createdAt);
      const [fb, nb] = chaveOrdem(b.tag, b.createdAt);
      return fa - fb || na - nb || a.tag.localeCompare(b.tag);
    });
    lista.forEach((eq, i) => {
      const para = tagDestino(sigla, i + 1);
      if (eq.tag !== para) plano.push({ id: eq.id, de: eq.tag, para });
    });
  }

  if (plano.length === 0) {
    return { atualizados: 0, total: eqs.length, semSetor };
  }

  await prisma.$transaction(
    async (tx) => {
      for (const p of plano) {
        await tx.equipamento.update({
          where: { id: p.id },
          data: { tag: `~RECODE-${p.id}` },
        });
      }
      for (const p of plano) {
        await tx.historicoTag.create({
          data: {
            equipamentoId: p.id,
            tagAnterior: p.de,
            tagNova: p.para,
            justificativa: JUSTIFICATIVA,
            usuarioId,
          },
        });
        await tx.equipamento.update({
          where: { id: p.id },
          data: { tag: p.para },
        });
      }
    },
    { timeout: 180_000 },
  );

  return { atualizados: plano.length, total: eqs.length, semSetor };
}

async function main() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_backup_equipamento_tag_20260928" (
      "id" TEXT PRIMARY KEY,
      "tag" TEXT NOT NULL,
      "setorId" TEXT,
      "estabelecimentoId" TEXT NOT NULL,
      "copiedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO "_backup_equipamento_tag_20260928" ("id", "tag", "setorId", "estabelecimentoId")
    SELECT e."id", e."tag", e."setorId", e."estabelecimentoId"
    FROM "Equipamento" e
    ON CONFLICT ("id") DO NOTHING
  `);

  const usuarioId = await usuarioHistorico();
  const estabelecimentos = await prisma.estabelecimento.findMany({
    where: { equipamentos: { some: {} } },
    select: { id: true, nome: true },
  });

  let atualizados = 0;
  const semSetor: string[] = [];
  for (const est of estabelecimentos) {
    const r = await recodificarEstabelecimento(est.id, usuarioId);
    atualizados += r.atualizados;
    semSetor.push(...r.semSetor.map((s) => `${est.nome}: ${s}`));
    console.log(`[aion] tags setor · ${est.nome}: ${r.atualizados} atualizada(s) de ${r.total}`);
  }

  if (semSetor.length) {
    console.log(`[aion] tags setor · sem sigla (${semSetor.length}): ${semSetor.slice(0, 30).join(" · ")}`);
  }
  console.log(`[aion] tags setor · total atualizado=${atualizados}`);
}

main()
  .catch((e) => {
    console.error("[aion] recodificar tags por setor falhou:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
