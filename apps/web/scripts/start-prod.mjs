#!/usr/bin/env node
/**
 * Start Next em produção.
 * NÃO usar process.env.HOSTNAME — no Railway ele é o nome do container
 * (ex.: 578165a7528b), e o edge proxy não alcança → 502.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = String(process.env.PORT || "3000");
// Só LISTEN_HOST / HOST override; ignora HOSTNAME do container.
const listenHost = process.env.LISTEN_HOST || process.env.HOST || "0.0.0.0";

process.env.PORT = port;

console.log(`[nexo/web] starting next on ${listenHost}:${port}`);

const child = spawn(
  "pnpm",
  ["exec", "next", "start", "--hostname", listenHost, "--port", port],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: false,
  },
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
