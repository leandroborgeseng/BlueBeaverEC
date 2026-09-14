import dns from "node:dns";
import { promises as dnsPromises } from "node:dns";
import { NextRequest, NextResponse } from "next/server";
import { Agent, fetch as undiciFetch } from "undici";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_API_PORT = "3001";
const CONNECT_MS = 2_000;

dns.setDefaultResultOrder("ipv6first");

/**
 * Rede privada Railway legado (antes de 16/10/2025) só tem AAAA.
 * getaddrinfo IPv4-only no Alpine devolve ENOTFOUND mesmo com o nome certo.
 * Sempre devolve lista (Happy Eyeballs do Node 22) e family 0 = A+AAAA.
 */
function dualStackLookup(
  hostname: string,
  options: dns.LookupOneOptions & { all?: boolean },
  callback: (...args: unknown[]) => void,
) {
  dns.lookup(hostname, { all: true, family: 0, verbatim: true }, (err, addresses) => {
    if (err) {
      callback(err);
      return;
    }
    if (options.all) {
      callback(null, addresses);
      return;
    }
    const first = addresses[0];
    if (!first) {
      const nf = new Error(`getaddrinfo ENOTFOUND ${hostname}`) as Error & { code: string };
      nf.code = "ENOTFOUND";
      callback(nf);
      return;
    }
    callback(null, first.address, first.family);
  });
}

const upstreamAgent = new Agent({
  connect: {
    autoSelectFamily: true,
    timeout: CONNECT_MS,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lookup: dualStackLookup as any,
  },
  connectTimeout: CONNECT_MS,
});

const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID,
);

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

/** Loop de volta para este Next — não para a API pública. */
function isSelfWebHost(hostname: string) {
  const h = hostname.toLowerCase();
  return h === "hef.aion.eng.br" || h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function stripHost(raw: string) {
  return raw.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0].split(":")[0];
}

function formatBase(host: string, port: string, protocol = "http") {
  const wrapped = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `${protocol}://${wrapped}:${port}`;
}

function parseConfiguredUrl() {
  let raw = process.env.API_INTERNAL_URL?.trim() || "";
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`;
  try {
    return new URL(raw.replace(/\/$/, ""));
  } catch {
    return null;
  }
}

function hostsFromWebServiceName() {
  const name = process.env.RAILWAY_SERVICE_NAME?.trim() || "";
  if (!name) return [];
  const slug = name
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[/_]/g, "-");
  const asApi = slug.replace(/-web$/, "-api").replace(/^web$/, "api");
  return unique([
    `${slug}.railway.internal`,
    `${asApi}.railway.internal`,
    slug === asApi ? "" : asApi,
  ]);
}

function candidateBases(): string[] {
  const bases: string[] = [];
  const extraHosts: string[] = [];

  const fromHost = process.env.API_INTERNAL_HOST?.trim();
  if (fromHost) extraHosts.push(stripHost(fromHost));

  const configured = parseConfiguredUrl();
  if (configured && !isSelfWebHost(configured.hostname)) {
    if (configured.hostname.endsWith(".railway.internal")) configured.protocol = "http:";
    extraHosts.unshift(configured.hostname);
    const proto = configured.protocol.replace(":", "");
    if (configured.port) {
      bases.push(formatBase(configured.hostname, configured.port, proto));
    } else if (configured.protocol === "https:") {
      bases.push(`${configured.protocol}//${configured.hostname}`);
    } else {
      bases.push(formatBase(configured.hostname, DEFAULT_API_PORT, proto));
    }
  }

  extraHosts.push(...hostsFromWebServiceName());

  if (onRailway) {
    extraHosts.push(
      "aionapi.railway.internal",
      "nexo-api.railway.internal",
      "nexoapi.railway.internal",
      "aion-api.railway.internal",
      "api.railway.internal",
    );
  } else {
    extraHosts.push("127.0.0.1");
  }

  const ports = unique([
    configured?.port ?? "",
    process.env.API_INTERNAL_PORT?.trim() ?? "",
    DEFAULT_API_PORT,
    "8080",
  ]);
  for (const host of unique(extraHosts).filter((h) => !isSelfWebHost(h))) {
    for (const port of ports) {
      bases.push(formatBase(host, port, "http"));
    }
  }
  return unique(bases).slice(0, 12);
}

/** resolve6/4 evita getaddrinfo IPv4-only (ENOTFOUND em AAAA-only). */
async function expandBaseWithIps(base: string): Promise<string[]> {
  try {
    const u = new URL(base);
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return [base];
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    const proto = u.protocol.replace(":", "");
    const [v6, v4] = await Promise.all([
      dnsPromises.resolve6(host).catch(() => [] as string[]),
      dnsPromises.resolve4(host).catch(() => [] as string[]),
    ]);
    return unique([
      ...v6.map((ip) => formatBase(ip, port, proto)),
      ...v4.map((ip) => formatBase(ip, port, proto)),
      base,
    ]);
  } catch {
    return [base];
  }
}

function errorDetail(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  const code = cause?.code ? ` [${cause.code}]` : "";
  const extra = cause?.message && cause.message !== err.message ? ` (${cause.message})` : "";
  return `${err.message}${code}${extra}`;
}

function configuredInternalHost() {
  return parseConfiguredUrl()?.hostname ?? null;
}

function publicTarget(base: string) {
  try {
    const u = new URL(base);
    return `${u.hostname}:${u.port || (u.protocol === "https:" ? "443" : "80")}`;
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
  const expanded = unique((await Promise.all(bases.map(expandBaseWithIps))).flat()).slice(0, 20);
  const ordered = lastGoodBase
    ? [lastGoodBase, ...expanded.filter((b) => b !== lastGoodBase)]
    : expanded;

  const configuredHost = configuredInternalHost();
  let dns6 = "skip";
  if (configuredHost) {
    try {
      const aaaa = await dnsPromises.resolve6(configuredHost);
      dns6 = aaaa.length ? `AAAA ${aaaa.slice(0, 2).join(",")}` : "empty";
    } catch (err) {
      dns6 = err instanceof Error ? err.message : String(err);
    }
  }

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
      reason: lastErr,
      tried: ordered.map(publicTarget),
      configuredHost,
      dns6,
      webService: process.env.RAILWAY_SERVICE_NAME ?? null,
    },
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
