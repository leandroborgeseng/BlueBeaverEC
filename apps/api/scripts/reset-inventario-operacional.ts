/**
 * Zera o inventário operacional (OS + solicitações + laudos de equipamento +
 * equipamentos + setores) e recarrega scripts/dados/equipamentos-reais.json.
 *
 * Preserva usuários, estabelecimento, autenticação, contratos, estoque, POPs,
 * planos de manutenção e catálogos (fabricante/modelo são reaproveitados no import).
 *
 * Uso (produção HEF — DATABASE_URL do Railway, NÃO o .env local):
 *   cd apps/api
 *   DATABASE_URL='postgresql://…' pnpm exec tsx scripts/reset-inventario-operacional.ts --confirm
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  INVENTARIO_OFICIAL_CHAVE,
  registrarCargaInventario,
} from "./inventario-oficial-marker.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const prisma = new PrismaClient();

function dbHost(url?: string) {
  try {
    return url ? new URL(url).hostname : "(sem DATABASE_URL)";
  } catch {
    return "(URL inválida)";
  }
}

function isLocalHost(host: string) {
  return host === "localhost" || host === "127.0.0.1" || host === "db" || host === "::1";
}

async function main() {
  const confirm = process.argv.includes("--confirm");
  const allowLocal = process.argv.includes("--allow-local");
  const jsonArg = process.argv.find((a, i, arr) => arr[i - 1] === "--json");
  const jsonFile = resolve(jsonArg ?? "scripts/dados/equipamentos-reais.json");

  if (!confirm) {
    console.error("Recuse sem --confirm. Esta operação apaga OS, solicitações, laudos, equipamentos e setores.");
    process.exit(1);
  }
  if (!existsSync(jsonFile)) {
    console.error(`JSON não encontrado: ${jsonFile}`);
    process.exit(1);
  }

  const host = dbHost(process.env.DATABASE_URL);
  console.log(`[aion] reset inventario → host=${host}`);
  if (isLocalHost(host) && !allowLocal) {
    console.error(
      "DATABASE_URL aponta para banco local. Use a URL pública do Postgres HEF (Railway) ou passe --allow-local.",
    );
    process.exit(1);
  }

  const estab =
    (await prisma.estabelecimento.findUnique({ where: { id: "estab_modelo" } })) ??
    (await prisma.estabelecimento.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!estab) {
    console.error("Nenhum estabelecimento.");
    process.exit(1);
  }

  const before = {
    os: await prisma.ordemServico.count({ where: { estabelecimentoId: estab.id } }),
    solicitacoes: await prisma.solicitacaoServico.count({ where: { estabelecimentoId: estab.id } }),
    laudos: await prisma.laudo.count({ where: { estabelecimentoId: estab.id } }),
    equipamentos: await prisma.equipamento.count({ where: { estabelecimentoId: estab.id } }),
    setores: await prisma.setor.count({ where: { estabelecimentoId: estab.id } }),
  };
  console.log("[aion] antes:", before);

  await prisma.$transaction(async (tx) => {
    await tx.naoConformidade.updateMany({
      where: { estabelecimentoId: estab.id, ordemServicoId: { not: null } },
      data: { ordemServicoId: null },
    });
    await tx.ordemServico.deleteMany({ where: { estabelecimentoId: estab.id } });
    await tx.solicitacaoServico.deleteMany({ where: { estabelecimentoId: estab.id } });
    await tx.laudo.deleteMany({ where: { estabelecimentoId: estab.id } });
    await tx.componenteRecuperado.deleteMany({ where: { estabelecimentoId: estab.id } });
    await tx.capexItem.updateMany({
      where: { estabelecimentoId: estab.id, equipamentoOrigemId: { not: null } },
      data: { equipamentoOrigemId: null },
    });
    await tx.equipamento.deleteMany({ where: { estabelecimentoId: estab.id } });
    await tx.usuarioEstabelecimento.updateMany({
      where: { estabelecimentoId: estab.id },
      data: { setorIds: [] },
    });
    await tx.setor.deleteMany({ where: { estabelecimentoId: estab.id } });
    await tx.contadorSequencia.updateMany({
      where: { estabelecimentoId: estab.id, chave: { in: ["OS", "SOL"] } },
      data: { valor: 0 },
    });
  });

  console.log("[aion] wipe operacional concluído — importando JSON…");

  const result = spawnSync(
    "pnpm",
    ["exec", "tsx", "scripts/import-equipamentos-reais.ts", jsonFile, "--estab", estab.id],
    { cwd: root, env: process.env, stdio: "inherit", shell: false },
  );
  if (result.status !== 0) {
    console.error("Import falhou após o wipe. Reimporte com import:equipamentos.");
    process.exit(result.status ?? 1);
  }

  const uti =
    (await prisma.setor.findFirst({
      where: { estabelecimentoId: estab.id, nome: { in: ["U.T.I.", "UTI Adulto", "UTI"] } },
    })) ??
    (await prisma.setor.findFirst({
      where: { estabelecimentoId: estab.id, nome: { contains: "U.T.I.", mode: "insensitive" } },
    }));

  const solicitante = await prisma.usuario.findUnique({ where: { email: "solicitante@aion.local" } });
  if (uti && solicitante) {
    await prisma.usuarioEstabelecimento.update({
      where: {
        usuarioId_estabelecimentoId: {
          usuarioId: solicitante.id,
          estabelecimentoId: estab.id,
        },
      },
      data: { setorIds: [uti.id] },
    });
    console.log(`[aion] solicitante vinculado ao setor ${uti.nome} (${uti.id})`);
  } else {
    console.log("[aion] avisos: não foi possível vincular solicitante@aion.local a U.T.I./UTI Adulto");
  }

  const after = {
    os: await prisma.ordemServico.count({ where: { estabelecimentoId: estab.id } }),
    solicitacoes: await prisma.solicitacaoServico.count({ where: { estabelecimentoId: estab.id } }),
    laudos: await prisma.laudo.count({ where: { estabelecimentoId: estab.id } }),
    equipamentos: await prisma.equipamento.count({ where: { estabelecimentoId: estab.id } }),
    setores: await prisma.setor.count({ where: { estabelecimentoId: estab.id } }),
  };
  console.log("[aion] depois:", after);

  await registrarCargaInventario(prisma, {
    chave: INVENTARIO_OFICIAL_CHAVE,
    estabelecimentoId: estab.id,
    before,
    after,
  });
  console.log(`[aion] marcador ${INVENTARIO_OFICIAL_CHAVE} gravado — próximos deploys não repetem o wipe`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
