#!/usr/bin/env node
/**
 * Boot automático (Railway):
 * 1. Seed demo se o banco não tiver usuários (ou SEED_ON_BOOT=true)
 *
 * Import de equipamentos reais roda em background via start-prod.mjs
 * (não bloqueia healthcheck / não deixa o deploy matar o processo no meio).
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { PrismaClient } = require("@prisma/client");

const forceSeed = process.env.SEED_ON_BOOT === "true" || process.env.SEED_ON_BOOT === "1";
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
  process.exit(0);
} catch (e) {
  console.error("[nexo] boot seed falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
