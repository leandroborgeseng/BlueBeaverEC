import { lookup as dnsLookup } from "node:dns/promises";
import { NextRequest, NextResponse } from "next/server";
import { Agent, fetch as undiciFetch } from "undici";
import type { LookupAddress } from "node:dns";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_API_PORT = "3001";
const CONNECT_MS = 2_000;

/**
 * API escuta em `::`. Rede privada Railway (legado) é AAAA-only.
 * ipv4first / family:4 faz o DNS de A pendurar ~10s e o Cloudflare troca
 * o JSON do Next pela página "error code: 502".
 */
function lookupPrefer6(
  hostname: string,
  _opts: unknown,
  callback: (err: Error | null, address: string, family: number) => void,
) {
  void (async () => {
    const answers: LookupAddress[] = [];
    try {
      answers.push(await dnsLookup(hostname, { family: 6, all: false }));
    } catch {
      /* sem AAAA */
    }
    if (answers.length === 0) {
      try {
        answers.push(await dnsLookup(hostname, { family: 4, all: false }));
      } catch {
        /* sem A */
      }
    }
    const picked = answers[0];
    if (!picked) {
      callback(new Error(`ENOTFOUND ${hostname}`), "", 0);
      return;
    }
    callback(null, picked.address, picked.family);
  })().catch((err: unknown) => {
    callback(err instanceof Error ? err : new Error(String(err)), "", 0);
  });
}

const upstreamAgent = new Agent({
  connect: {
    lookup: lookupPrefer6,
    timeout: CONNECT_MS,
  },
  connectTimeout: CONNECT_MS,
});

const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID,
);

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function isLoopHost(hostname: string) {
  const h = hostname.toLowerCase();
  return (
    h === "hef.aion.eng.br" ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h.endsWith(".aion.eng.br")
  );
}

function stripHost(raw: string) {
  return raw.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0].split(":")[0];
}

function formatBase(host: string, port: string) {
  const wrapped = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${wrapped}:${port}`;
}

/** Poucos destinos: o cartesian host×porta estourava o timeout do edge. */
function candidateBases(): string[] {
  const hosts: string[] = [];
  let urlPort: string | undefined;

  const fromHost = process.env.API_INTERNAL_HOST?.trim();
  if (fromHost) hosts.push(stripHost(fromHost));

  let raw = process.env.API_INTERNAL_URL?.trim() || "";
  if (raw) {
    raw = raw.replace(/\/$/, "");
    if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
    try {
      const u = new URL(raw);
      if (!isLoopHost(u.hostname)) {
        hosts.push(u.hostname);
        if (u.port) urlPort = u.port;
      }
    } catch {
      /* ignore */
    }
  }

  if (onRailway) {
    hosts.push(
      "aionapi.railway.internal",
      "nexo-api.railway.internal",
      "api.railway.internal",
    );
  } else {
    hosts.push("127.0.0.1");
  }

  const primaryPort =
    urlPort ||
    process.env.API_INTERNAL_PORT?.trim() ||
    process.env.API_PORT?.trim() ||
    DEFAULT_API_PORT;

  const ports = unique([primaryPort, primaryPort === DEFAULT_API_PORT ? "" : DEFAULT_API_PORT]);
  const bases: string[] = [];
  for (const host of unique(hosts).filter((h) => !(onRailway && isLoopHost(h)))) {
    for (const port of ports) {
      bases.push(formatBase(host, port));
    }
  }
  return unique(bases).slice(0, 8);
}

function errorDetail(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  const code = cause?.code ? ` [${cause.code}]` : "";
  const extra = cause?.message && cause.message !== err.message ? ` (${cause.message})` : "";
  return `${err.message}${code}${extra}`;
}

function publicTarget(base: string) {
  try {
    const u = new URL(base);
    return `${u.hostname}:${u.port || "80"}`;
  } catch {
    return "unknown";
  }
}

let lastGoodBase: string | null = null;

async function proxy(req: NextRequest, path: string[]) {
  const headers: Record<string, string> = {};
  const contentType = req.headers.get("content-type");
  const authorization = req.headers.get("authorization");
  if (contentType) headers["content-type"] = contentType;
  if (authorization) headers.authorization = authorization;

  const method = req.method;
  const body =
    method !== "GET" && method !== "HEAD" ? Buffer.from(await req.arrayBuffer()) : undefined;

  const suffix = `/api/${path.join("/")}${req.nextUrl.search}`;
  const bases = candidateBases();
  const ordered = lastGoodBase ? [lastGoodBase, ...bases.filter((b) => b !== lastGoodBase)] : bases;

  let lastErr = "sem destino";
  let lastBase = ordered[0] ?? "";
  for (const base of ordered) {
    lastBase = base;
    const target = `${base}${suffix}`;
    try {
      const upstream = await undiciFetch(target, {
        method,
        headers,
        body,
        dispatcher: upstreamAgent,
        redirect: "manual",
      });
      lastGoodBase = base;
      const buf = Buffer.from(await upstream.arrayBuffer());
      const out = new NextResponse(buf, { status: upstream.status });
      const upstreamType = upstream.headers.get("content-type");
      const disposition = upstream.headers.get("content-disposition");
      if (upstreamType) out.headers.set("content-type", upstreamType);
      if (disposition) out.headers.set("content-disposition", disposition);
      return out;
    } catch (err) {
      lastErr = errorDetail(err);
      if (base === lastGoodBase) lastGoodBase = null;
      console.error(`[aion] proxy API falhou target=${base} ${lastErr}`);
    }
  }

  return NextResponse.json(
    {
      message:
        "API inacessível. Tente de novo em instantes. Se persistir, o serviço da API pode estar fora do ar.",
      target: publicTarget(lastBase),
    },
    // 503: Cloudflare substitui 502 de origem pela página genérica "error code: 502".
    { status: 503 },
  );
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PUT(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
