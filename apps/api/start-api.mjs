#!/usr/bin/env node
/**
 * Cópia em apps/api para Railpack com root directory = pacote da API.
 * Mesma lógica do start-api.mjs da raiz do monorepo.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  "/opt/aion-boot/start-prod.mjs",
  "/app/aion-runtime/start-prod.mjs",
  path.join(here, "../aion-runtime/start-prod.mjs"),
  path.join(here, "scripts/start-prod.mjs"),
  "/app/apps/api/scripts/start-prod.mjs",
];

const found = candidates.find((c) => existsSync(c));
if (!found) {
  console.error("[aion] start-prod.mjs não encontrado. Candidatos:", candidates.join(", "));
  process.exit(1);
}

console.log(`[aion] boot via ${found}`);
await import(pathToFileURL(found).href);
