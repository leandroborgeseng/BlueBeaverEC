#!/usr/bin/env node
/**
 * Boot automático (Railway):
 * 1. Seed demo completo se o banco não tiver usuários (ou SEED_ON_BOOT=true)
 * 2. Sempre sincroniza contas demo Aion (e-mail/senha) via ensure-demo-users
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = path.resolve(root, "../..");
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
  const userCount = await prisma.usuario.count();
  if (!forceSeed && userCount > 0) {
    console.log(`[aion] seed completo skipped (${userCount} usuário(s) já existem)`);
  } else {
    console.log(
      forceSeed
        ? "[aion] SEED_ON_BOOT=true — executando seed…"
        : "[aion] banco sem usuários — executando seed demo…",
    );
    const tsx = resolveTsx();
    if (tsx) run(process.execPath, [tsx, "prisma/seed.ts"]);
    else run("pnpm", ["exec", "tsx", "prisma/seed.ts"]);
  }

  // Sempre: migra @nexo.local e redefine senha demo aion1234
  run(process.execPath, [path.join(root, "scripts/ensure-demo-users.mjs")]);

  process.exit(0);
} catch (e) {
  console.error("[aion] boot seed falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
