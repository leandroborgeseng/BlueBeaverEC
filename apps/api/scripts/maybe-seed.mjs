#!/usr/bin/env node
/**
 * Boot automático (Railway / Coolify / compose):
 * 1. Seed demo se o banco não tiver usuários (ou SEED_ON_BOOT=true)
 * 2. Import de equipamentos reais se scripts/dados/equipamentos-reais.json existir
 *    e ainda não tiver sido carregado (ou IMPORT_EQUIPAMENTOS_ON_BOOT=true)
 *
 * Não exige comando manual no host.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { PrismaClient } = require("@prisma/client");

const forceSeed = process.env.SEED_ON_BOOT === "true" || process.env.SEED_ON_BOOT === "1";
const forceImport =
  process.env.IMPORT_EQUIPAMENTOS_ON_BOOT === "true" ||
  process.env.IMPORT_EQUIPAMENTOS_ON_BOOT === "1";

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

try {
  const userCount = await prisma.usuario.count();
  if (!forceSeed && userCount > 0) {
    console.log(`[nexo] seed skipped (${userCount} usuário(s) já existem)`);
  } else {
    console.log(
      forceSeed
        ? "[nexo] SEED_ON_BOOT=true — executando seed…"
        : "[nexo] banco sem usuários — executando seed demo…",
    );
    run("pnpm", ["exec", "tsx", "prisma/seed.ts"]);
  }

  const importFile = path.join(root, "scripts/dados/equipamentos-reais.json");
  if (!existsSync(importFile)) {
    console.log("[nexo] import equipamentos: arquivo equipamentos-reais.json ausente — skip");
  } else {
    // Marcador: primeiro desfibrilador do extract HRTC (tag 7716)
    const marker = await prisma.equipamento.findFirst({
      where: { tag: "7716" },
      select: { id: true },
    });
    if (marker && !forceImport) {
      console.log("[nexo] import equipamentos skipped (dados reais já presentes)");
    } else {
      console.log(
        forceImport
          ? "[nexo] IMPORT_EQUIPAMENTOS_ON_BOOT=true — importando equipamentos reais…"
          : "[nexo] importando equipamentos reais (HRTC)…",
      );
      run("pnpm", ["exec", "tsx", "scripts/import-equipamentos-reais.ts", "scripts/dados/equipamentos-reais.json"]);
    }
  }

  process.exit(0);
} catch (e) {
  console.error("[nexo] boot seed/import falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
