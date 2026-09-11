#!/usr/bin/env node
/**
 * One-shot no boot: pedidos PENDENTE viram OS (marcador CargaInventario).
 * Não apaga inventário. Próximos deploys só pulam.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cargaInventarioExiste,
  envFlagAtiva,
  hostDatabase,
  isLocalDatabase,
  registrarCargaInventario,
} from "./inventario-oficial-marker.mjs";

export const SOLICITACOES_ABERTAS_VIRAM_OS_CHAVE = "solicitacoes_abertas_viram_os_v1";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = path.resolve(root, "../..");
const require = createRequire(path.join(root, "package.json"));
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const force = envFlagAtiva("CONVERT_SOLICITACOES_ON_BOOT");

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveTsx() {
  const candidates = [
    path.join(root, "node_modules", "tsx", "dist", "cli.mjs"),
    path.join(monorepoRoot, "node_modules", "tsx", "dist", "cli.mjs"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

try {
  const ja = await cargaInventarioExiste(prisma, SOLICITACOES_ABERTAS_VIRAM_OS_CHAVE);
  const local = isLocalDatabase();
  console.log(
    `[aion] solicitacoes→OS host=${hostDatabase()} marcador=${SOLICITACOES_ABERTAS_VIRAM_OS_CHAVE} aplicado=${ja} force=${force}`,
  );

  if (ja && !force) {
    console.log("[aion] solicitacoes→OS skipped (marcador já gravado)");
    process.exit(0);
  }

  if (local && !force) {
    console.log("[aion] solicitacoes→OS skipped (banco local — produção Railway aplica sozinha)");
    process.exit(0);
  }

  const tsx = resolveTsx();
  if (tsx) run(process.execPath, [tsx, "scripts/converter-solicitacoes-abertas.ts"]);
  else run("pnpm", ["exec", "tsx", "scripts/converter-solicitacoes-abertas.ts"]);

  await registrarCargaInventario(
    prisma,
    { motivo: "pedidos PENDENTE convertidos em OS corretiva nao atribuida" },
    SOLICITACOES_ABERTAS_VIRAM_OS_CHAVE,
  );
  console.log(`[aion] marcador ${SOLICITACOES_ABERTAS_VIRAM_OS_CHAVE} gravado — próximos deploys não repetem`);
  process.exit(0);
} catch (e) {
  console.error("[aion] solicitacoes→OS falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
