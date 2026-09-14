import { NextRequest, NextResponse } from "next/server";
import dns from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_API_PORT = "3001";
const CONNECT_MS = 2_500;

// Node 17+ prefere AAAA; a API escuta em 0.0.0.0. IPv4 primeiro evita timeout → 502.
dns.setDefaultResultOrder("ipv4first");

const upstreamAgent = new Agent({
  connect: { family: 0 },
  connectTimeout: CONNECT_MS,
});

const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID,
);

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function stripHost(raw: string) {
  return raw.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0].split(":")[0];
}

function portsFromEnv(urlPort?: string) {
  return unique([
    urlPort ?? "",
    process.env.API_INTERNAL_PORT?.trim() ?? "",
    process.env.API_PORT?.trim() ?? "",
    DEFAULT_API_PORT,
    "8080",
  ]);
}

/** Hosts internos conhecidos — API_INTERNAL_URL pode estar vazio após republish. */
function candidateBases(): string[] {
  const hosts: string[] = [];
  let urlPort: string | undefined;

  const fromHost = process.env.API_INTERNAL_HOST?.trim();
  if (fromHost) hosts.push(stripHost(fromHost));

  let raw = process.env.API_INTERNAL_URL?.trim() || process.env.API_URL?.trim() || "";
  if (raw) {
    raw = raw.replace(/\/$/, "");
    if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
    try {
      const u = new URL(raw);
      hosts.push(u.hostname);
      if (u.port) urlPort = u.port;
    } catch {
      /* ignore */
    }
  }

  if (onRailway) {
    hosts.push(
      "aionapi.railway.internal",
      "nexo-api.railway.internal",
      "nexoapi.railway.internal",
      "api.railway.internal",
      "aion-api.railway.internal",
    );
  } else {
    hosts.push("127.0.0.1");
  }

  const ports = portsFromEnv(urlPort);
  const bases: string[] = [];
  for (const host of unique(hosts)) {
    for (const port of ports) {
      bases.push(`http://${host}:${port}`);
    }
  }
  return unique(bases);
}

function errorDetail(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  const code = cause?.code ? ` [${cause.code}]` : "";
  const extra = cause?.message && cause.message !== err.message ? ` (${cause.message})` : "";
  return `${err.message}${code}${extra}`;
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
  for (const base of ordered) {
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
      message: "API inacessível. Tente de novo em instantes. Se persistir, o serviço da API pode estar fora do ar.",
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
