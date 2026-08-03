#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { PrismaClient } = require("@prisma/client");

const force = process.env.SEED_ON_BOOT === "true" || process.env.SEED_ON_BOOT === "1";
const prisma = new PrismaClient();

try {
  const count = await prisma.usuario.count();
  if (!force && count > 0) {
    console.log(`[nexo] seed skipped (${count} usuário(s) já existem)`);
    process.exit(0);
  }

  console.log(
    force
      ? "[nexo] SEED_ON_BOOT=true — executando seed…"
      : "[nexo] banco sem usuários — executando seed demo…",
  );

  const result = spawnSync("pnpm", ["exec", "tsx", "prisma/seed.ts"], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
} finally {
  await prisma.$disconnect();
}
