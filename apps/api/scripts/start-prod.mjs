#!/usr/bin/env node
/**
 * Resolve DATABASE_URL before Prisma/Nest start.
 * On Railway, discrete PG* vars can be fresher than a stale DATABASE_URL reference.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveDatabaseUrl() {
  const {
    DATABASE_URL,
    PGHOST,
    PGPORT,
    PGUSER,
    PGPASSWORD,
    PGDATABASE,
  } = process.env;

  if (PGUSER && PGPASSWORD && PGDATABASE) {
    let host = PGHOST;
    let port = PGPORT || "5432";

    if (!host && DATABASE_URL) {
      try {
        const parsed = new URL(DATABASE_URL);
        host = parsed.hostname;
        if (parsed.port) port = parsed.port;
      } catch {
        // keep falling through
      }
    }

    if (host) {
      const user = encodeURIComponent(PGUSER);
      const pass = encodeURIComponent(PGPASSWORD);
      const db = encodeURIComponent(PGDATABASE);
      return `postgresql://${user}:${pass}@${host}:${port}/${db}?schema=public`;
    }
  }

  return DATABASE_URL;
}

const url = resolveDatabaseUrl();
if (!url) {
  console.error(
    "DATABASE_URL ausente. Defina DATABASE_URL ou PGUSER/PGPASSWORD/PGDATABASE (+ PGHOST).",
  );
  process.exit(1);
}

process.env.DATABASE_URL = url;

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
