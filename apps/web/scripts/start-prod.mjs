#!/usr/bin/env node
/**
 * Start Next em produção.
 * NÃO usar process.env.HOSTNAME — no Railway ele é o nome do container
 * (ex.: 578165a7528b), e o edge proxy não alcança → 502.
 *
 * Evita `pnpm --filter` / `pnpm exec` (quebra se o host ainda aponta @nexo/*).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = path.resolve(root, "../..");
const port = String(process.env.PORT || "3000");
// Só LISTEN_HOST / HOST override; ignora HOSTNAME do container.
const listenHost = process.env.LISTEN_HOST || process.env.HOST || "0.0.0.0";

process.env.PORT = port;

function resolveNextBin() {
  const candidates = [
    path.join(root, "node_modules", "next", "dist", "bin", "next"),
    path.join(monorepoRoot, "node_modules", "next", "dist", "bin", "next"),
    path.join(root, "node_modules", ".bin", "next"),
    path.join(monorepoRoot, "node_modules", ".bin", "next"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

const nextBin = resolveNextBin();
console.log(`[aion/web] starting next on ${listenHost}:${port}`);

const child = nextBin
  ? spawn(process.execPath, [nextBin, "start", "--hostname", listenHost, "--port", port], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: false,
    })
  : spawn("pnpm", ["exec", "next", "start", "--hostname", listenHost, "--port", port], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
      shell: false,
    });

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
