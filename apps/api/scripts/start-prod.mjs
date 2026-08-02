#!/usr/bin/env node
/**
 * Start production: migrate + API.
 * Prefers DATABASE_URL as provided by the host (Railway).
 * Assembles from PG* only when DATABASE_URL is missing.
 */
import { spawnSync } from "node:child_process";
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
run(process.execPath, ["dist/main.js"]);
