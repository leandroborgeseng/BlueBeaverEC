#!/usr/bin/env node
/**
 * Importa PDFs de laudos de todas as pastas em scripts/dados/laudos-*.
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

const dados = path.join(root, "scripts/dados");
const prisma = new PrismaClient();

/** Pastas conhecidas + qualquer laudos-* futura */
function listLaudoDirs() {
  const fixed = [
    "laudos-desfibriladores",
    "laudos-preventiva",
    "laudos-calibracao",
    "laudos-tse",
    "laudos-qualificacao",
  ];
  const found = new Set();
  for (const name of fixed) {
    const p = path.join(dados, name);
    if (existsSync(p)) found.add(p);
  }
  if (existsSync(dados)) {
    for (const ent of readdirSync(dados, { withFileTypes: true })) {
      if (ent.isDirectory() && ent.name.startsWith("laudos-")) {
        found.add(path.join(dados, ent.name));
      }
    }
  }
  return [...found];
}

async function countAnexosForDir(dirName) {
  // Conta anexos cujo nomeArquivo bate com arquivos desta pasta (já importados).
  const files = existsSync(dirName)
    ? readdirSync(dirName).filter((f) => f.toLowerCase().endsWith(".pdf"))
    : [];
  if (files.length === 0) return { expected: 0, anexos: 0, files };

  const anexos = await prisma.laudoAnexo.count({
    where: { nomeArquivo: { in: files } },
  });
  return { expected: files.length, anexos, files };
}

try {
  const dirs = listLaudoDirs();
  if (dirs.length === 0) {
    console.log("[aion] import laudos PDF: nenhuma pasta laudos-* — skip");
    process.exit(0);
  }

  let exitCode = 0;

  for (const dir of dirs) {
    const rel = path.relative(root, dir);
    const { expected, anexos } = await countAnexosForDir(dir);
    console.log(`[aion] import laudos PDF (${path.basename(dir)}): ${anexos}/${expected} anexos`);

    if (expected === 0) {
      console.log(`[aion] ${path.basename(dir)}: vazia — skip`);
      continue;
    }

    if (!force && anexos >= expected) {
      console.log(`[aion] ${path.basename(dir)}: carga completa — skip`);
      continue;
    }

    console.log(
      force
        ? `[aion] IMPORT_LAUDOS_ON_BOOT=true — reimportando ${rel}…`
        : `[aion] importando ${rel} (${expected - anexos} faltando)…`,
    );

    const result = spawnSync("pnpm", ["exec", "tsx", "scripts/import-laudos-pdf.ts", rel], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: false,
    });

    if (result.error) {
      console.error(result.error);
      exitCode = 1;
    } else if ((result.status ?? 1) !== 0) {
      exitCode = result.status ?? 1;
    }
  }

  process.exit(exitCode);
} catch (e) {
  console.error("[aion] import laudos PDF falhou:", e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
