#!/usr/bin/env node
/**
 * Start Next em produção com host/porta que o Railway espera.
 * Evita expansão de ${PORT} quebrada e o modo standalone do monorepo.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = String(process.env.PORT || "3000");
const hostname = process.env.HOSTNAME || "0.0.0.0";

process.env.HOSTNAME = hostname;
process.env.PORT = port;

console.log(`[nexo/web] starting next on ${hostname}:${port}`);

const child = spawn(
  "pnpm",
  ["exec", "next", "start", "--hostname", hostname, "--port", port],
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
