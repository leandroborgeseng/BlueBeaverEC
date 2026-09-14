import dns from "node:dns";
import { NextRequest, NextResponse } from "next/server";
import { Agent, fetch as undiciFetch } from "undici";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_API_PORT = "3001";
const CONNECT_MS = 2_000;

/**
 * API escuta em `::`. Rede privada Railway legado é AAAA-only.
 * Não customizar `lookup`: o Node 22 usa Happy Eyeballs com `all: true`.
 */
dns.setDefaultResultOrder("ipv6first");

const upstreamAgent = new Agent({
  connect: { autoSelectFamily: true, timeout: CONNECT_MS },
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
    h.endsWith(".aion.eng.br") ||
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1"
  );
}

function stripHost(raw: string) {
  return raw.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0].split(":")[0];
}

function formatBase(host: string, port: string) {
  const wrapped = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${wrapped}:${port}`;
}

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
      "nexoapi.railway.internal",
      "aion-api.railway.internal",
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

  const ports = unique([primaryPort, DEFAULT_API_PORT, "8080"]);
  const bases: string[] = [];
  for (const port of ports) {
    for (const host of unique(hosts).filter((h) => !(onRailway && isLoopHost(h)))) {
      bases.push(formatBase(host, port));
    }
  }
  return unique(bases).slice(0, 12);
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
