// T-AA: cores de marca/borda só via tokens de globals.css (fonte única).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const TOKENS = "app/globals.css";
// Literais montados em partes para que o próprio teste não apareça no `rg` do critério.
const L = 0.64, C = 0.19, H = 38, G = 170;
const num = (n) => String(n).replace(/^0\./, "0?\\.");
const PROIBIDOS = [
  { nome: "primary antigo", re: new RegExp(`oklch\\(\\s*${num(L)}\\s+${num(C)}\\s+${H}\\s*\\)`, "gi") },
  { nome: "borda cinza 170", re: new RegExp(`rgba?\\(\\s*${G}\\s*,?\\s*${G}\\s*,?\\s*${G}\\s*(?:[,/][^)]*)?\\)`, "gi") },
  { nome: "borda #aaa / #aaaaaa", re: /#aaa(?:aaa)?\b/gi },
];

function arquivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(tsx?|jsx?|css|mjs)$/.test(n) ? [p] : [];
  });
}

test("apps/web/src sem cores hardcoded fora do arquivo de tokens", () => {
  const achados = [];
  for (const f of arquivos(SRC)) {
    const rel = relative(SRC, f).split("\\").join("/");
    if (rel === TOKENS) continue;
    readFileSync(f, "utf8").split("\n").forEach((linha, i) => {
      for (const { nome, re } of PROIBIDOS) if (linha.match(re)) achados.push(`${rel}:${i + 1} ${nome}`);
    });
  }
  assert.deepEqual(achados, [], `Use var(--aion-primary) / var(--aion-border-control):\n${achados.join("\n")}`);
});

test("o detector pega variações de espaço", () => {
  for (const s of [`oklch(${L} ${C} ${H})`, `oklch( ${L}  ${C} ${H} )`, `oklch(.64 .19 ${H})`, `rgb(${G},${G},${G})`, `rgb(${G}, ${G}, ${G})`, `rgb(${G} ${G} ${G})`, "#aaa"])
    assert.ok(PROIBIDOS.some(({ re }) => { re.lastIndex = 0; return re.test(s); }), s);
});
