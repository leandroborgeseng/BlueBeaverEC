#!/usr/bin/env node
/**
 * One-shot no boot: recodifica TAG HEF-NNNN → HEF-{sigla}-{seq}.
 * Backup em _backup_equipamento_tag_20260928. Próximos deploys pulam (marcador).
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

export const TAGS_HEF_POR_SETOR_CHAVE = "tags_hef_por_setor_v1";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = path.resolve(root, "../..");
const require = createRequire(path.join(root, "package.json"));
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const force = envFlagAtiva("RECODE_TAGS_SETOR_ON_BOOT");

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
  const ja = await cargaInventarioExiste(prisma, TAGS_HEF_POR_SETOR_CHAVE);
  const local = isLocalDatabase();
  console.log(
    `[aion] tags→setor host=${hostDatabase()} marcador=${TAGS_HEF_POR_SETOR_CHAVE} aplicado=${ja} force=${force}`,
  );

  if (ja && !force) {
    console.log("[aion] tags→setor skipped (marcador já gravado)");
    process.exit(0);
  }

  if (local && !force) {
    console.log("[aion] tags→setor skipped (banco local — produção Railway aplica sozinha)");
    process.exit(0);
  }

  const tsx = resolveTsx();
  if (tsx) run(process.execPath, [tsx, "scripts/recodificar-tags-setor.ts"]);
  else run("pnpm", ["exec", "tsx", "scripts/recodificar-tags-setor.ts"]);

  await registrarCargaInventario(
    prisma,
    { motivo: "TAGs recodificadas para HEF-{sigla}-{seq} por setor funcional" },
    TAGS_HEF_POR_SETOR_CHAVE,
  );
  console.log(`[aion] marcador ${TAGS_HEF_POR_SETOR_CHAVE} gravado — próximos deploys não repetem`);
  process.exit(0);
} catch (e) {
  console.error("[aion] tags→setor falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
