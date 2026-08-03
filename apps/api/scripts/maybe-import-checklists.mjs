#!/usr/bin/env node
/**
 * Importa checklists preventiva → ProcedimentoLaudo + vínculo Pop.
 * Force: IMPORT_CHECKLISTS_ON_BOOT=true
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
  process.env.IMPORT_CHECKLISTS_ON_BOOT === "true" ||
  process.env.IMPORT_CHECKLISTS_ON_BOOT === "1";

const dir = path.join(root, "scripts/dados/checklists-preventiva");
const prisma = new PrismaClient();

try {
  if (!existsSync(dir)) {
    console.log("[aion] import checklists preventiva: pasta ausente — skip");
    process.exit(0);
  }

  const expected = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json")).length;
  if (expected === 0) {
    console.log("[aion] import checklists preventiva: nenhum JSON — skip");
    process.exit(0);
  }

  const vinculados = await prisma.pop.count({
    where: {
      codigo: { startsWith: "POP.EC.MP." },
      procedimentoLaudoId: { not: null },
    },
  });

  console.log(
    `[aion] import checklists preventiva: ${vinculados}/${expected} POPs MP com procedimento`,
  );

  if (!force && vinculados >= expected) {
    console.log("[aion] import checklists preventiva skipped (carga completa)");
    process.exit(0);
  }

  console.log(
    force
      ? "[aion] IMPORT_CHECKLISTS_ON_BOOT=true — reimportando…"
      : `[aion] importando checklists (${expected - vinculados} faltando)…`,
  );

  const args = [
    "exec",
    "tsx",
    "scripts/import-checklists-preventiva.ts",
    "scripts/dados/checklists-preventiva",
  ];
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
  console.error("[aion] import checklists preventiva falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
