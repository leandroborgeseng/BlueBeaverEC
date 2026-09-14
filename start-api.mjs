#!/usr/bin/env node
/**
 * Entry de produção fora de apps/api (volume Railway tapa o cwd).
 * Procura start-prod copiado para /opt ou aion-runtime; cai no scripts/ do pacote.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  "/opt/aion-boot/start-prod.mjs",
  "/app/aion-runtime/start-prod.mjs",
  path.join(here, "aion-runtime", "start-prod.mjs"),
  path.join(here, "apps/api/scripts/start-prod.mjs"),
  path.join(here, "scripts/start-prod.mjs"),
];

const found = candidates.find((c) => existsSync(c));
if (!found) {
  console.error("[aion] start-prod.mjs não encontrado. Candidatos:", candidates.join(", "));
  process.exit(1);
}

console.log(`[aion] boot via ${found}`);
await import(pathToFileURL(found).href);
