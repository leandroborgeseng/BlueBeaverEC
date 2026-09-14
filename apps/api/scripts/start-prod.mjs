#!/usr/bin/env node
/**
 * Start production: migrate + seed (não derruba o HTTP) + API.
 * Import em background só com IMPORT_ON_BOOT=1 (evita OOM/crash loop → 502).
 * Prefers DATABASE_URL as provided by the host (Railway).
 *
 * Inventário: maybe-import-equipamentos aplica wipe+JSON oficial HEF uma vez
 * (CargaInventario / inventario_oficial_hef_v2 — TAGs HEF-0001…). Depois só
 * completa tags do JSON atual — não recria a carga HRTC antiga.
 * Force: RESET_INVENTARIO_OPERACIONAL=1.
 *
 * Pedidos PENDENTE → OS: maybe-converter-solicitacoes-abertas (marcador
 * solicitacoes_abertas_viram_os_v1). Roda uma vez; não apaga inventário.
 *
 * Evita `pnpm --filter` (quebra se o host ainda aponta @nexo/*).
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

function detectApiRoot() {
  const fromEnv = process.env.AION_API_ROOT?.trim();
  if (fromEnv && existsSync(path.join(fromEnv, "package.json"))) return fromEnv;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fromScript = path.resolve(here, "..");
  if (existsSync(path.join(fromScript, "prisma"))) return fromScript;
  if (existsSync("/app/apps/api/package.json")) return "/app/apps/api";
  return fromScript;
}

const root = detectApiRoot();
const monorepoRoot = process.env.AION_ROOT?.trim()
  || (existsSync("/app/pnpm-workspace.yaml") ? "/app" : path.resolve(root, "../.."));

if (!process.env.PORT?.trim()) {
  process.env.PORT = process.env.API_PORT?.trim() || "3001";
}
if (!process.env.LISTEN_HOST?.trim()) {
  process.env.LISTEN_HOST = "0.0.0.0";
}

console.log(
  `[aion] boot apiRoot=${root} monorepo=${monorepoRoot} PORT=${process.env.PORT} LISTEN_HOST=${process.env.LISTEN_HOST}`,
);

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

function runPrisma(args) {
  const prismaJs = path.join(monorepoRoot, "node_modules", "prisma", "build", "index.js");
  const prismaLocal = path.join(root, "node_modules", "prisma", "build", "index.js");
  if (existsSync(prismaJs)) {
    run(process.execPath, [prismaJs, ...args]);
  } else if (existsSync(prismaLocal)) {
    run(process.execPath, [prismaLocal, ...args]);
  } else {
    const prismaBin = resolveBin("prisma");
    if (prismaBin) run(prismaBin, args);
    else run("pnpm", ["exec", "prisma", ...args]);
  }
}

function runNestBuild() {
  const nestBin = resolveBin("nest");
  if (nestBin) {
    run(nestBin, ["build"]);
    return;
  }
  const nestJs = [
    path.join(root, "node_modules", "@nestjs", "cli", "bin", "nest.js"),
    path.join(monorepoRoot, "node_modules", "@nestjs", "cli", "bin", "nest.js"),
  ];
  for (const c of nestJs) {
    if (existsSync(c)) {
      run(process.execPath, [c, "build"]);
      return;
    }
  }
  run("pnpm", ["exec", "nest", "build"]);
}

function distHasMain(dir) {
  return existsSync(path.join(dir, "main.js")) || existsSync(path.join(dir, "src", "main.js"));
}

function persistBuiltDist() {
  const dist = path.join(root, "dist");
  if (!distHasMain(dist)) return;
  for (const dest of ["/opt/aion-dist", path.join(monorepoRoot, "aion-runtime", "dist")]) {
    try {
      mkdirSync(dest, { recursive: true });
      cpSync(dist, dest, { recursive: true });
      console.log(`[aion] dist persistido em ${dest}`);
    } catch (err) {
      console.warn(`[aion] persist ${dest}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

function hydrateDistFromImage() {
  const dest = path.join(root, "dist");
  if (distHasMain(dest)) return;
  const sources = [
    "/opt/aion-dist",
    path.join(monorepoRoot, "aion-runtime", "dist"),
    "/app/aion-runtime/dist",
  ];
  for (const src of sources) {
    if (!distHasMain(src)) continue;
    try {
      mkdirSync(dest, { recursive: true });
      cpSync(src, dest, { recursive: true });
      console.log(`[aion] dist hidratado de ${src} → ${dest}`);
      return;
    } catch (err) {
      console.warn(`[aion] hidratar ${src}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

function apiEntryCandidates() {
  return [
    path.join("/opt/aion-dist", "main.js"),
    path.join("/opt/aion-dist", "src", "main.js"),
    path.join(monorepoRoot, "aion-runtime", "dist", "main.js"),
    path.join(monorepoRoot, "aion-runtime", "dist", "src", "main.js"),
    "/app/aion-runtime/dist/main.js",
    "/app/aion-runtime/dist/src/main.js",
    path.join(root, "dist", "main.js"),
    path.join(root, "dist", "src", "main.js"),
  ];
}

function resolveApiEntry() {
  for (const c of apiEntryCandidates()) {
    if (existsSync(c)) return c;
  }
  return null;
}

function ensureApiEntry() {
  hydrateDistFromImage();
  let entry = resolveApiEntry();
  if (entry) {
    console.log(`[aion] API entry ${entry}`);
    return entry;
  }

  console.warn(
    "[aion] dist/main.js ausente — volume pode ter tapado o bundle da imagem. Gerando prisma generate + nest build…",
  );
  runPrisma(["generate"]);
  runNestBuild();
  persistBuiltDist();

  entry = resolveApiEntry();
  if (entry) {
    console.log(`[aion] API entry após build ${entry}`);
    return entry;
  }

  console.error(
    "[aion] nest build não gerou dist/main.js nem dist/src/main.js. Candidatos: " +
      apiEntryCandidates().join(", "),
  );
  process.exit(1);
}

runPrisma(["migrate", "deploy"]);

const seed = spawnSync(process.execPath, [path.join(root, "scripts/maybe-seed.mjs")], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: false,
});
if (seed.status !== 0) {
  console.error(
    `[aion] boot seed falhou (code=${seed.status ?? "?"}) — API sobe mesmo assim`,
  );
}

const convSol = spawnSync(process.execPath, [path.join(root, "scripts/maybe-converter-solicitacoes-abertas.mjs")], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: false,
});
if (convSol.status !== 0) {
  console.error(
    `[aion] conversão de solicitações abertas falhou (code=${convSol.status ?? "?"}) — API sobe mesmo assim`,
  );
}

// Import em background DEPOIS da API: healthcheck do Railway não mata o boot.
const api = spawn(process.execPath, [ensureApiEntry()], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: false,
});

const importOnBoot =
  process.env.IMPORT_ON_BOOT === "true" || process.env.IMPORT_ON_BOOT === "1";

if (!importOnBoot) {
  console.log("[aion] import em background desligado (defina IMPORT_ON_BOOT=1 para habilitar)");
} else setTimeout(() => {
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
