#!/usr/bin/env node
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneApp = path.join(root, ".next/standalone/apps/web");
const serverJs = path.join(standaloneApp, "server.js");

if (!existsSync(serverJs)) {
  console.error(
    "standalone/server.js ausente. Rode o build do @nexo/web antes do start.",
  );
  process.exit(1);
}

const staticSrc = path.join(root, ".next/static");
const staticDest = path.join(standaloneApp, ".next/static");
if (existsSync(staticSrc) && !existsSync(staticDest)) {
  cpSync(staticSrc, staticDest, { recursive: true });
}

const publicSrc = path.join(root, "public");
const publicDest = path.join(standaloneApp, "public");
if (existsSync(publicSrc) && !existsSync(publicDest)) {
  cpSync(publicSrc, publicDest, { recursive: true });
}

process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
process.env.PORT = process.env.PORT || "3000";

const child = spawn(process.execPath, [serverJs], {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
