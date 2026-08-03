#!/usr/bin/env node
/**
 * Importa biblioteca de POPs (metadados + PDF no banco) se incompleto.
 * Force: IMPORT_POPS_ON_BOOT=true
 */
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { PrismaClient } = require("@prisma/client");

const force =
  process.env.IMPORT_POPS_ON_BOOT === "true" || process.env.IMPORT_POPS_ON_BOOT === "1";

const dir = path.join(root, "scripts/dados/pops-biblioteca");
const prisma = new PrismaClient();

try {
  if (!existsSync(dir)) {
    console.log("[nexo] import pops biblioteca: pasta ausente — skip");
    process.exit(0);
  }

  const expected = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf")).length;
  if (expected === 0) {
    console.log("[nexo] import pops biblioteca: nenhum PDF — skip");
    process.exit(0);
  }

  const comPdf = await prisma.pop.count({
    where: { conteudo: { not: null } },
  });

  console.log(`[nexo] import pops biblioteca: ${comPdf}/${expected} PDFs no banco`);

  if (!force && comPdf >= expected) {
    console.log("[nexo] import pops biblioteca skipped (PDFs já no banco)");
    process.exit(0);
  }

  console.log(
    force
      ? "[nexo] IMPORT_POPS_ON_BOOT=true — reimportando PDFs…"
      : `[nexo] gravando PDFs da biblioteca (${expected - comPdf} faltando)…`,
  );

  const args = ["exec", "tsx", "scripts/import-pops-biblioteca.ts", "scripts/dados/pops-biblioteca"];
  if (force) args.push("--force");

  const result = spawnSync("pnpm", args, {
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
} catch (e) {
  console.error("[nexo] import pops biblioteca falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
