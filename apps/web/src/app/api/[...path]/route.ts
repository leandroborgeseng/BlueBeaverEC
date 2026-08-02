import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_API_PORT = "3001";

/** Normaliza URL interna; Railway costuma deixar `:PORT` vazio na referência cruzada. */
function backendBase() {
  const fromHost = process.env.API_INTERNAL_HOST?.trim();
  const port =
    process.env.API_INTERNAL_PORT?.trim() ||
    process.env.API_PORT?.trim() ||
    DEFAULT_API_PORT;

  if (fromHost) {
    const host = fromHost.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `http://${host}:${port}`;
  }

  let raw =
    process.env.API_INTERNAL_URL?.trim() ||
    process.env.API_URL?.trim() ||
    `http://127.0.0.1:${DEFAULT_API_PORT}`;

  raw = raw.replace(/\/$/, "");

  try {
    const u = new URL(raw);
    if (!u.port) {
      u.port = port;
    }
    // http://host: → URL parser may drop empty port; restore explicitly
    return u.toString().replace(/\/$/, "");
  } catch {
    // http://host: ou http://host
    const m = raw.match(/^(https?:\/\/[^/:]+)(?::(\d*))?$/);
    if (m) {
      return `${m[1]}:${m[2] || port}`;
    }
    return raw;
  }
}

async function proxy(req: NextRequest, path: string[]) {
  const base = backendBase();
  const target = `${base}/api/${path.join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  const authorization = req.headers.get("authorization");
  if (contentType) headers.set("content-type", contentType);
  if (authorization) headers.set("authorization", authorization);

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  try {
    const upstream = await fetch(target, init);
    const body = await upstream.arrayBuffer();
    const out = new NextResponse(body, { status: upstream.status });
    const upstreamType = upstream.headers.get("content-type");
    const disposition = upstream.headers.get("content-disposition");
    if (upstreamType) out.headers.set("content-type", upstreamType);
    if (disposition) out.headers.set("content-disposition", disposition);
    return out;
  } catch (err) {
    const message = err instanceof Error ? err.message : "proxy error";
    return NextResponse.json(
      {
        message: `API inacessível (${base}): ${message}. No web use API_INTERNAL_HOST + API_INTERNAL_PORT=3001 (e na API defina PORT=3001).`,
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
