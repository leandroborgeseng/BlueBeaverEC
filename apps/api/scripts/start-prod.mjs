#!/usr/bin/env node
/**
 * Start production: migrate + seed (rápido) + API + import em background.
 * Prefers DATABASE_URL as provided by the host (Railway).
 */
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assembleFromPgVars() {
  const { PGHOST, PGPORT = "5432", PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (!PGHOST || !PGUSER || !PGPASSWORD || !PGDATABASE) return undefined;

  const user = encodeURIComponent(PGUSER);
  const pass = encodeURIComponent(PGPASSWORD);
  const db = encodeURIComponent(PGDATABASE);
  return `postgresql://${user}:${pass}@${PGHOST}:${PGPORT}/${db}?schema=public`;
}

function resolveDatabaseUrl() {
  const raw = process.env.DATABASE_URL?.trim();
  if (raw) return raw;
  return assembleFromPgVars();
}

function logTarget(url) {
  try {
    const u = new URL(url);
    console.log(
      `[nexo] DB target user=${decodeURIComponent(u.username)} host=${u.hostname} port=${u.port || "5432"} db=${u.pathname.replace(/^\//, "")}`,
    );
  } catch {
    console.log("[nexo] DB target: (URL inválida)");
  }
}

const url = resolveDatabaseUrl();
if (!url) {
  console.error(
    "DATABASE_URL ausente. Defina DATABASE_URL (recomendado) ou PGHOST/PGUSER/PGPASSWORD/PGDATABASE.",
  );
  process.exit(1);
}

process.env.DATABASE_URL = url;
logTarget(url);

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

run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
run(process.execPath, [path.join(root, "scripts/maybe-seed.mjs")]);

// Import em background DEPOIS da API: healthcheck do Railway não mata o boot.
const api = spawn(process.execPath, ["dist/main.js"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: false,
});

setTimeout(() => {
  console.log("[nexo] iniciando import de equipamentos em background…");
  const imp = spawn(process.execPath, [path.join(root, "scripts/maybe-import-equipamentos.mjs")], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: false,
    detached: false,
  });
  imp.on("exit", (code) => {
    console.log(`[nexo] import equipamentos finalizado (code=${code ?? "?"})`);
    console.log("[nexo] iniciando import de planos de manutenção…");
    const planos = spawn(process.execPath, [path.join(root, "scripts/maybe-import-planos.mjs")], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: false,
      detached: false,
    });
    planos.on("exit", (c1) => {
      console.log(`[nexo] import planos finalizado (code=${c1 ?? "?"})`);
      console.log("[nexo] iniciando import de laudos PDF em background…");
      const laudos = spawn(process.execPath, [path.join(root, "scripts/maybe-import-laudos.mjs")], {
        cwd: root,
        env: process.env,
        stdio: "inherit",
        shell: false,
        detached: false,
      });
      laudos.on("exit", (c2) => {
        console.log(`[nexo] import laudos PDF finalizado (code=${c2 ?? "?"})`);
      });
    });
  });
}, 4000);

api.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
