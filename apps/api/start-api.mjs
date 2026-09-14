#!/usr/bin/env node
/**
 * Entry Railpack: `pnpm --filter @nexo/api start`.
 * Bind 0.0.0.0:PORT na hora (rede privada / healthcheck). Nest sobe atrás
 * em 127.0.0.1 para migrate/dist não deixarem a porta muda.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicPort = Number(process.env.PORT || process.env.API_PORT || "3001");
const nestPort = publicPort === 3001 ? 3002 : 3001;

const bootCandidates = [
  "/opt/aion-boot/start-prod.mjs",
  "/app/aion-runtime/start-prod.mjs",
  path.join(here, "../aion-runtime/start-prod.mjs"),
  path.join(here, "scripts/start-prod.mjs"),
  "/app/apps/api/scripts/start-prod.mjs",
];

let nestUp = false;

function handle(req, res) {
  const url = req.url || "/";
  if (!nestUp) {
    const pathOnly = url.split("?")[0];
    if (pathOnly === "/api/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "aion-api", boot: "starting" }));
      return;
    }
    res.writeHead(503, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        message:
          "API inacessível. Tente de novo em instantes. Se persistir, o serviço da API pode estar fora do ar.",
      }),
    );
    return;
  }

  const headers = { ...req.headers, host: `127.0.0.1:${nestPort}` };
  const p = http.request(
    { hostname: "127.0.0.1", port: nestPort, path: url, method: req.method, headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  p.on("error", () => {
    nestUp = false;
    if (!res.headersSent) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          message:
            "API inacessível. Tente de novo em instantes. Se persistir, o serviço da API pode estar fora do ar.",
        }),
      );
    } else res.end();
  });
  req.pipe(p);
}

function listen(host, ipv6Only) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handle);
    const onErr = (err) => {
      server.off("error", onErr);
      reject(err);
    };
    server.once("error", onErr);
    server.listen({ port: publicPort, host, ipv6Only }, () => {
      server.off("error", onErr);
      resolve(server);
    });
  });
}

await listen("0.0.0.0");
console.log(`[aion] gateway 0.0.0.0:${publicPort} → nest 127.0.0.1:${nestPort}`);
try {
  await listen("::", true);
  console.log(`[aion] gateway [::]:${publicPort}`);
} catch (err) {
  console.warn(`[aion] IPv6 gateway skip: ${err instanceof Error ? err.message : err}`);
}

setInterval(() => {
  http
    .get(`http://127.0.0.1:${nestPort}/api/health`, (r) => {
      nestUp = r.statusCode === 200;
      r.resume();
    })
    .on("error", () => {
      nestUp = false;
    });
}, 400).unref();

const boot = bootCandidates.find((c) => existsSync(c));
if (!boot) {
  console.error("[aion] start-prod.mjs não encontrado. Candidatos:", bootCandidates.join(", "));
  process.exit(1);
}

console.log(`[aion] boot nest via ${boot}`);
const child = spawn(process.execPath, [boot], {
  cwd: existsSync("/app/apps/api/package.json") ? "/app/apps/api" : path.resolve(here),
  env: {
    ...process.env,
    PORT: String(nestPort),
    API_PORT: String(nestPort),
    LISTEN_HOST: "127.0.0.1",
  },
  stdio: "inherit",
  shell: false,
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
