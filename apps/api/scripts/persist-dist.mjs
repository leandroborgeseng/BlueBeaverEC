#!/usr/bin/env node
/**
 * Copia o bundle Nest para paths fora do cwd.
 * No Railway um volume em /app/apps/api esconde o dist da imagem → crash
 * `Cannot find module dist/main.js`. /opt e aion-runtime sobrevivem.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = path.resolve(root, "../..");
const dist = path.join(root, "dist");
const hasMain =
  existsSync(path.join(dist, "main.js")) || existsSync(path.join(dist, "src", "main.js"));

if (!hasMain) {
  console.warn("[aion] persist-dist: dist/main.js ausente — skip");
  process.exit(0);
}

const distDests = ["/opt/aion-dist", path.join(monorepoRoot, "aion-runtime", "dist")];
for (const dest of distDests) {
  try {
    mkdirSync(dest, { recursive: true });
    cpSync(dist, dest, { recursive: true });
    console.log(`[aion] dist copiado para ${dest}`);
  } catch (err) {
    console.warn(`[aion] não copiou dist para ${dest}: ${err instanceof Error ? err.message : err}`);
  }
}

const boot = path.join(root, "scripts", "start-prod.mjs");
const startApi = path.join(root, "start-api.mjs");
const bootDests = [
  "/opt/aion-boot/start-prod.mjs",
  path.join(monorepoRoot, "aion-runtime", "start-prod.mjs"),
];
if (existsSync(boot)) {
  for (const dest of bootDests) {
    try {
      mkdirSync(path.dirname(dest), { recursive: true });
      cpSync(boot, dest);
      console.log(`[aion] start-prod copiado para ${dest}`);
    } catch (err) {
      console.warn(
        `[aion] não copiou start-prod para ${dest}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
if (existsSync(startApi)) {
  for (const dest of ["/opt/aion-boot/start-api.mjs", path.join(monorepoRoot, "aion-runtime", "start-api.mjs")]) {
    try {
      mkdirSync(path.dirname(dest), { recursive: true });
      cpSync(startApi, dest);
      console.log(`[aion] start-api copiado para ${dest}`);
    } catch (err) {
      console.warn(
        `[aion] não copiou start-api para ${dest}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
