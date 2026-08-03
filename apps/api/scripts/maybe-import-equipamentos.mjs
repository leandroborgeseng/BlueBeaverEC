#!/usr/bin/env node
/**
 * Importa equipamentos-reais.json se o banco ainda não tiver a carga completa.
 * Idempotente (upsert por tag). Pode rodar em background após a API subir.
 *
 * Critério: conta quantas tags do JSON já existem; se incompleto, importa de novo.
 * Force: IMPORT_EQUIPAMENTOS_ON_BOOT=true
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { PrismaClient } = require("@prisma/client");

const force =
  process.env.IMPORT_EQUIPAMENTOS_ON_BOOT === "true" ||
  process.env.IMPORT_EQUIPAMENTOS_ON_BOOT === "1";

const importFile = path.join(root, "scripts/dados/equipamentos-reais.json");
const prisma = new PrismaClient();

try {
  if (!existsSync(importFile)) {
    console.log("[nexo] import equipamentos: arquivo ausente — skip");
    process.exit(0);
  }

  const payload = JSON.parse(readFileSync(importFile, "utf8"));
  const tags = (payload.equipamentos ?? []).map((e) => String(e.tag).trim()).filter(Boolean);
  const expected = tags.length;
  if (expected === 0) {
    console.log("[nexo] import equipamentos: JSON vazio — skip");
    process.exit(0);
  }

  const presentes = await prisma.equipamento.count({
    where: { tag: { in: tags } },
  });

  console.log(`[nexo] import equipamentos: ${presentes}/${expected} tags do JSON já no banco`);

  if (!force && presentes >= expected) {
    console.log("[nexo] import equipamentos skipped (carga completa)");
    process.exit(0);
  }

  console.log(
    force
      ? "[nexo] IMPORT_EQUIPAMENTOS_ON_BOOT=true — reimportando…"
      : `[nexo] retomando import (${expected - presentes} faltando)…`,
  );

  const result = spawnSync(
    "pnpm",
    ["exec", "tsx", "scripts/import-equipamentos-reais.ts", "scripts/dados/equipamentos-reais.json"],
    {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: false,
    },
  );

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
} catch (e) {
  console.error("[nexo] import equipamentos falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
