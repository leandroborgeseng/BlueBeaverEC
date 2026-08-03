#!/usr/bin/env node
/**
 * Seed planos de manutenção + vínculo equipamentos (nexo_extract_v2).
 * Force: IMPORT_PLANOS_ON_BOOT=true
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { PrismaClient } = require("@prisma/client");

const force =
  process.env.IMPORT_PLANOS_ON_BOOT === "true" || process.env.IMPORT_PLANOS_ON_BOOT === "1";

const refFile = path.join(root, "scripts/dados/planos_manutencao_referencia.json");
const v2File = path.join(root, "scripts/dados/nexo_extract_v2.json");
const prisma = new PrismaClient();

try {
  if (!existsSync(refFile) || !existsSync(v2File)) {
    console.log("[nexo] import planos: arquivos ausentes — skip");
    process.exit(0);
  }

  const tipos = await prisma.tipoEquipamentoPlano.count();
  const vinculados = await prisma.equipamento.count({
    where: { tipoEquipamentoPlanoId: { not: null } },
  });

  console.log(`[nexo] import planos: ${tipos} tipos · ${vinculados} equipamentos vinculados`);

  if (!force && tipos >= 131 && vinculados > 200) {
    console.log("[nexo] import planos skipped (carga completa)");
    process.exit(0);
  }

  console.log(
    force
      ? "[nexo] IMPORT_PLANOS_ON_BOOT=true — reimportando planos…"
      : "[nexo] importando catálogo de planos + vínculos…",
  );

  const args = ["exec", "tsx", "scripts/import-planos-manutencao.ts"];
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
  console.error("[nexo] import planos falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
