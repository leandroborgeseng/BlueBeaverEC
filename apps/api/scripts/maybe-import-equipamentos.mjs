#!/usr/bin/env node
/**
 * Boot Railway: aplica o inventário oficial HEF uma vez (wipe + JSON),
 * depois só completa tags faltantes desse JSON — nunca recria a carga HRTC antiga.
 *
 * One-shot: tabela CargaInventario / chave inventario_oficial_hef_v1
 * Force: RESET_INVENTARIO_OPERACIONAL=1 (não deixar ligado — apaga OS de novo)
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  INVENTARIO_OFICIAL_CHAVE,
  cargaInventarioExiste,
  envFlagAtiva,
  hostDatabase,
  isLocalDatabase,
} from "./inventario-oficial-marker.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = path.resolve(root, "../..");
const require = createRequire(path.join(root, "package.json"));
const { PrismaClient } = require("@prisma/client");

const forceReset = envFlagAtiva("RESET_INVENTARIO_OPERACIONAL");
const forceImport =
  envFlagAtiva("IMPORT_EQUIPAMENTOS_ON_BOOT") && !forceReset;

const importFile = path.join(root, "scripts/dados/equipamentos-reais.json");
const prisma = new PrismaClient();

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

function runTs(script, extraArgs = []) {
  const tsx = resolveTsx();
  if (tsx) run(process.execPath, [tsx, script, ...extraArgs]);
  else run("pnpm", ["exec", "tsx", script, ...extraArgs]);
}

try {
  if (!existsSync(importFile)) {
    console.log("[aion] import equipamentos: arquivo ausente — skip");
    process.exit(0);
  }

  const payload = JSON.parse(readFileSync(importFile, "utf8"));
  const tags = (payload.equipamentos ?? []).map((e) => String(e.tag).trim()).filter(Boolean);
  const expected = tags.length;
  if (expected === 0) {
    console.log("[aion] import equipamentos: JSON vazio — skip");
    process.exit(0);
  }

  const jaOficial = await cargaInventarioExiste(prisma);
  const local = isLocalDatabase();
  console.log(
    `[aion] inventario host=${hostDatabase()} marcador=${INVENTARIO_OFICIAL_CHAVE} aplicado=${jaOficial} forceReset=${forceReset}`,
  );

  if (forceReset || !jaOficial) {
    const allowLocal = envFlagAtiva("RESET_INVENTARIO_ALLOW_LOCAL");
    if (local && !allowLocal) {
      console.log(
        "[aion] marcador oficial ausente, mas DATABASE_URL é local — skip wipe e skip import (produção Railway aplica sozinha)",
      );
      process.exit(0);
    }
    console.log(
      forceReset
        ? "[aion] RESET_INVENTARIO_OPERACIONAL=1 — wipe+import oficial HEF"
        : `[aion] primeira carga ${INVENTARIO_OFICIAL_CHAVE} — wipe operacional + import de ${expected} equipamentos`,
    );
    const resetArgs = ["--confirm"];
    if (local) resetArgs.push("--allow-local");
    runTs("scripts/reset-inventario-operacional.ts", resetArgs);
    console.log(`[aion] inventario oficial HEF aplicado (${expected} tags)`);
    process.exit(0);
  }

  const presentes = await prisma.equipamento.count({
    where: { tag: { in: tags } },
  });

  console.log(`[aion] import equipamentos: ${presentes}/${expected} tags do JSON oficial já no banco`);

  if (!forceImport && presentes >= expected) {
    console.log("[aion] import equipamentos skipped (carga oficial completa)");
    process.exit(0);
  }

  console.log(
    forceImport
      ? "[aion] IMPORT_EQUIPAMENTOS_ON_BOOT=true — reimportando JSON oficial (sem wipe)…"
      : `[aion] retomando import oficial (${expected - presentes} faltando)…`,
  );

  runTs("scripts/import-equipamentos-reais.ts", ["scripts/dados/equipamentos-reais.json"]);
  process.exit(0);
} catch (e) {
  console.error("[aion] import equipamentos falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
