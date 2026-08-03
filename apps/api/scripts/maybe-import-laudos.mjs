#!/usr/bin/env node
/**
 * Importa PDFs de laudos se a pasta existir e ainda faltarem anexos.
 * Force: IMPORT_LAUDOS_ON_BOOT=true
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
  process.env.IMPORT_LAUDOS_ON_BOOT === "true" || process.env.IMPORT_LAUDOS_ON_BOOT === "1";

const dir = path.join(root, "scripts/dados/laudos-desfibriladores");
const prisma = new PrismaClient();

try {
  if (!existsSync(dir)) {
    console.log("[nexo] import laudos PDF: pasta ausente — skip");
    process.exit(0);
  }

  const expected = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf")).length;
  if (expected === 0) {
    console.log("[nexo] import laudos PDF: nenhum PDF — skip");
    process.exit(0);
  }

  const anexos = await prisma.laudoAnexo.count({
    where: {
      OR: [
        { nomeArquivo: { contains: "_CALIBRACAO_" } },
        { nomeArquivo: { contains: "_TSE_" } },
      ],
    },
  });

  console.log(`[nexo] import laudos PDF: ${anexos}/${expected} anexos no banco`);

  if (!force && anexos >= expected) {
    console.log("[nexo] import laudos PDF skipped (carga completa)");
    process.exit(0);
  }

  console.log(
    force
      ? "[nexo] IMPORT_LAUDOS_ON_BOOT=true — reimportando PDFs…"
      : `[nexo] retomando import de laudos PDF (${expected - anexos} faltando)…`,
  );

  const result = spawnSync(
    "pnpm",
    ["exec", "tsx", "scripts/import-laudos-pdf.ts", "scripts/dados/laudos-desfibriladores"],
    { cwd: root, env: process.env, stdio: "inherit", shell: false },
  );

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
} catch (e) {
  console.error("[nexo] import laudos PDF falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
