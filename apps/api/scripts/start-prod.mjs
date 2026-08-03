#!/usr/bin/env node
/**
 * Start production: migrate + seed (rápido) + API + import em background.
 * Prefers DATABASE_URL as provided by the host (Railway).
 *
 * Evita `pnpm --filter` (quebra se o host ainda aponta @nexo/*).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = path.resolve(root, "../..");

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
      `[aion] DB target user=${decodeURIComponent(u.username)} host=${u.hostname} port=${u.port || "5432"} db=${u.pathname.replace(/^\//, "")}`,
    );
  } catch {
    console.log("[aion] DB target: (URL inválida)");
  }
}

const url = resolveDatabaseUrl();
if (!url) {
  console.error(
    "DATABASE_URL ausente. Defina DATABASE_URL (recomendado) ou PGHOST/PGUSER/PGPASSWORD/PGDATABASE.",
  );
  process.exit(1);
}

const jwtSecret = process.env.JWT_SECRET?.trim();
const weakSecrets = new Set(["", "change-me", "change-me-in-production", "dev-secret-change-me"]);
if (!jwtSecret || weakSecrets.has(jwtSecret)) {
  console.error(
    "[aion] JWT_SECRET ausente ou fraco. Defina um segredo forte antes de subir a API em produção.",
  );
  process.exit(1);
}

process.env.DATABASE_URL = url;
logTarget(url);

function resolveBin(name) {
  const candidates = [
    path.join(root, "node_modules", ".bin", name),
    path.join(monorepoRoot, "node_modules", ".bin", name),
    path.join(root, "node_modules", name, "build", "index.js"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

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

const prismaJs = path.join(monorepoRoot, "node_modules", "prisma", "build", "index.js");
const prismaLocal = path.join(root, "node_modules", "prisma", "build", "index.js");
if (existsSync(prismaJs)) {
  run(process.execPath, [prismaJs, "migrate", "deploy"]);
} else if (existsSync(prismaLocal)) {
  run(process.execPath, [prismaLocal, "migrate", "deploy"]);
} else {
  const prismaBin = resolveBin("prisma");
  if (prismaBin) run(prismaBin, ["migrate", "deploy"]);
  else run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
}

run(process.execPath, [path.join(root, "scripts/maybe-seed.mjs")]);

// Import em background DEPOIS da API: healthcheck do Railway não mata o boot.
const api = spawn(process.execPath, ["dist/main.js"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: false,
});

setTimeout(() => {
  console.log("[aion] iniciando import de equipamentos em background…");
  const imp = spawn(process.execPath, [path.join(root, "scripts/maybe-import-equipamentos.mjs")], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: false,
    detached: false,
  });
  imp.on("exit", (code) => {
    console.log(`[aion] import equipamentos finalizado (code=${code ?? "?"})`);
    console.log("[aion] iniciando import de planos de manutenção…");
    const planos = spawn(process.execPath, [path.join(root, "scripts/maybe-import-planos.mjs")], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: false,
      detached: false,
    });
    planos.on("exit", (c1) => {
      console.log(`[aion] import planos finalizado (code=${c1 ?? "?"})`);
      console.log("[aion] iniciando import da biblioteca de POPs…");
      const pops = spawn(process.execPath, [path.join(root, "scripts/maybe-import-pops.mjs")], {
        cwd: root,
        env: process.env,
        stdio: "inherit",
        shell: false,
        detached: false,
      });
      pops.on("exit", (cp) => {
        console.log(`[aion] import pops biblioteca finalizado (code=${cp ?? "?"})`);
        console.log("[aion] iniciando import de checklists preventiva…");
        const checks = spawn(
          process.execPath,
          [path.join(root, "scripts/maybe-import-checklists.mjs")],
          {
            cwd: root,
            env: process.env,
            stdio: "inherit",
            shell: false,
            detached: false,
          },
        );
        checks.on("exit", (cc) => {
          console.log(`[aion] import checklists preventiva finalizado (code=${cc ?? "?"})`);
          console.log("[aion] iniciando import de checklists TSE…");
          const tse = spawn(
            process.execPath,
            [path.join(root, "scripts/maybe-import-checklists-tse.mjs")],
            {
              cwd: root,
              env: process.env,
              stdio: "inherit",
              shell: false,
              detached: false,
            },
          );
          tse.on("exit", (ct) => {
            console.log(`[aion] import checklists TSE finalizado (code=${ct ?? "?"})`);
            console.log("[aion] iniciando import de checklists calibração…");
            const cal = spawn(
              process.execPath,
              [path.join(root, "scripts/maybe-import-checklists-calibracao.mjs")],
              {
                cwd: root,
                env: process.env,
                stdio: "inherit",
                shell: false,
                detached: false,
              },
            );
            cal.on("exit", (cca) => {
              console.log(`[aion] import checklists calibração finalizado (code=${cca ?? "?"})`);
              console.log("[aion] iniciando import de checklists qualificação…");
              const qlf = spawn(
                process.execPath,
                [path.join(root, "scripts/maybe-import-checklists-qualificacao.mjs")],
                {
                  cwd: root,
                  env: process.env,
                  stdio: "inherit",
                  shell: false,
                  detached: false,
                },
              );
              qlf.on("exit", (cq) => {
                console.log(`[aion] import checklists qualificação finalizado (code=${cq ?? "?"})`);
                console.log("[aion] iniciando import de laudos PDF em background…");
                const laudos = spawn(
                  process.execPath,
                  [path.join(root, "scripts/maybe-import-laudos.mjs")],
                  {
                    cwd: root,
                    env: process.env,
                    stdio: "inherit",
                    shell: false,
                    detached: false,
                  },
                );
                laudos.on("exit", (c2) => {
                  console.log(`[aion] import laudos PDF finalizado (code=${c2 ?? "?"})`);
                });
              });
            });
          });
        });
      });
    });
  });
}, 4000);

api.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
