import { NextRequest, NextResponse } from "next/server";
import { Agent, fetch as undiciFetch } from "undici";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_API_PORT = "3001";

/** Dual-stack para *.railway.internal (IPv4/IPv6). */
const upstreamAgent = new Agent({
  connect: { family: 0 },
  connectTimeout: 10_000,
});

/** Rede privada Railway é HTTP puro — nunca HTTPS. */
function backendBase() {
  const port =
    process.env.API_INTERNAL_PORT?.trim() ||
    process.env.API_PORT?.trim() ||
    DEFAULT_API_PORT;

  const fromHost = process.env.API_INTERNAL_HOST?.trim();
  if (fromHost) {
    const host = fromHost.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `http://${host}:${port}`;
  }

  let raw =
    process.env.API_INTERNAL_URL?.trim() ||
    process.env.API_URL?.trim() ||
    `http://127.0.0.1:${DEFAULT_API_PORT}`;

  raw = raw.replace(/\/$/, "");
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;

  try {
    const u = new URL(raw);
    if (u.hostname.endsWith(".railway.internal") || u.hostname === "localhost") {
      u.protocol = "http:";
    }
    if (!u.port) u.port = port;
    return `${u.protocol}//${u.hostname}:${u.port}`;
  } catch {
    return `http://127.0.0.1:${port}`;
  }
}

function errorDetail(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  const code = cause?.code ? ` [${cause.code}]` : "";
  const extra = cause?.message && cause.message !== err.message ? ` (${cause.message})` : "";
  return `${err.message}${code}${extra}`;
}

async function proxy(req: NextRequest, path: string[]) {
  const base = backendBase();
  const target = `${base}/api/${path.join("/")}${req.nextUrl.search}`;
  const headers: Record<string, string> = {};
  const contentType = req.headers.get("content-type");
  const authorization = req.headers.get("authorization");
  if (contentType) headers["content-type"] = contentType;
  if (authorization) headers.authorization = authorization;

  const method = req.method;
  const body =
    method !== "GET" && method !== "HEAD" ? Buffer.from(await req.arrayBuffer()) : undefined;

  try {
    const upstream = await undiciFetch(target, {
      method,
      headers,
      body,
      dispatcher: upstreamAgent,
      redirect: "manual",
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    const out = new NextResponse(buf, { status: upstream.status });
    const upstreamType = upstream.headers.get("content-type");
    const disposition = upstream.headers.get("content-disposition");
    if (upstreamType) out.headers.set("content-type", upstreamType);
    if (disposition) out.headers.set("content-disposition", disposition);
    return out;
  } catch (err) {
    return NextResponse.json(
      {
        message: `API inacessível (${base}): ${errorDetail(err)}. Use http:// (não https) no host *.railway.internal, mesma PORT da API, e API Active. Alternativa: URL pública https://…up.railway.app.`,
      },
      { status: 502 },
    );
  }
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
