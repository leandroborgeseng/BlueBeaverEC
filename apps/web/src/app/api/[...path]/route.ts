import { resolve4, resolve6 } from "node:dns/promises";
import { NextRequest, NextResponse } from "next/server";
import { Agent, fetch as undiciFetch } from "undici";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_API_PORT = "3001";
const CONNECT_MS = 2_500;

const upstreamAgent = new Agent({
  connect: { timeout: CONNECT_MS, autoSelectFamily: true },
  connectTimeout: CONNECT_MS,
});

const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID,
);

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function isSelfWebHost(hostname: string) {
  const h = hostname.toLowerCase();
  return h === "hef.aion.eng.br" || h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function stripHost(raw: string) {
  return raw.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0].split(":")[0];
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

function slugServiceName(name: string) {
  return name
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[/_]/g, "-");
}

function hostsFromWebServiceName() {
  const name = process.env.RAILWAY_SERVICE_NAME?.trim() || "";
  if (!name) return [];
  const slug = slugServiceName(name);
  const asApi = slug.replace(/-web$/, "-api").replace(/^web$/, "api");
  return unique([`${asApi}.railway.internal`, `${slug.replace(/-web$/, "-api")}.railway.internal`]);
}

function hostsFromPrivateDomain() {
  const own = process.env.RAILWAY_PRIVATE_DOMAIN?.trim();
  const api =
    process.env.API_RAILWAY_PRIVATE_DOMAIN?.trim() ||
    process.env.API_PRIVATE_DOMAIN?.trim() ||
    process.env.API_INTERNAL_HOST?.trim();
  const out: string[] = [];
  if (api) out.push(stripHost(api));
  if (own) {
    const host = stripHost(own);
    out.push(host.replace(/-web(?=\.|$)/g, "-api").replace(/(^|\.)web(?=\.|$)/g, "$1api"));
  }
  return out;
}

function hostnameCandidates(): string[] {
  const hosts: string[] = [];
  const fromHost = process.env.API_INTERNAL_HOST?.trim();
  if (fromHost) hosts.push(stripHost(fromHost));
  const configured = parseConfiguredUrl();
  if (configured && !isSelfWebHost(configured.hostname)) {
    hosts.unshift(configured.hostname);
  }
  hosts.push(...hostsFromPrivateDomain());
  hosts.push(...hostsFromWebServiceName());
  if (onRailway) {
    hosts.push(
      "nexo-api.railway.internal",
      "nexoapi.railway.internal",
      "aion-api.railway.internal",
      "aionapi.railway.internal",
      "api.railway.internal",
    );
  } else {
    hosts.push("127.0.0.1");
  }
  return unique(hosts).filter((h) => !isSelfWebHost(h));
}

function portCandidates(): string[] {
  const configured = parseConfiguredUrl();
  return unique([
    configured?.port ?? "",
    process.env.API_INTERNAL_PORT?.trim() ?? "",
    DEFAULT_API_PORT,
    "8080",
  ]);
}

/** Alpine/musl getaddrinfo costuma devolver ENOTFOUND para AAAA-only (rede privada Railway). */
async function resolveIps(hostname: string): Promise<string[]> {
  if (hostname.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return [hostname];
  }
  const ips: string[] = [];
  try {
    for (const ip of await resolve6(hostname)) ips.push(`[${ip}]`);
  } catch {
    /* sem AAAA */
  }
  try {
    ips.push(...(await resolve4(hostname)));
  } catch {
    /* sem A */
  }
  return unique(ips);
}

type Attempt = { label: string; url: string; hostHeader: string };

async function buildAttempts(pathSuffix: string): Promise<Attempt[]> {
  const attempts: Attempt[] = [];
  const configured = parseConfiguredUrl();
  if (configured && !isSelfWebHost(configured.hostname) && configured.protocol === "https:") {
    const origin = configured.port
      ? `https://${configured.hostname}:${configured.port}`
      : `https://${configured.hostname}`;
    attempts.push({
      label: configured.hostname,
      url: `${origin}${pathSuffix}`,
      hostHeader: configured.hostname,
    });
  }

  for (const hostname of hostnameCandidates()) {
    const ips = await resolveIps(hostname);
    if (!ips.length) continue;
    for (const port of portCandidates()) {
      for (const ip of ips) {
        attempts.push({
          label: `${hostname}:${port}`,
          url: `http://${ip}:${port}${pathSuffix}`,
          hostHeader: hostname,
        });
      }
    }
  }
  return attempts.slice(0, 16);
}

async function dns6Report() {
  const configured = parseConfiguredUrl()?.hostname;
  const own = process.env.RAILWAY_PRIVATE_DOMAIN?.trim();
  const report: Record<string, string> = {};
  for (const host of unique([configured, own, ...hostnameCandidates().slice(0, 4)].filter(Boolean) as string[])) {
    try {
      const aaaa = await resolve6(host);
      report[host] = aaaa.length ? `AAAA ${aaaa.slice(0, 2).join(",")}` : "empty";
    } catch (err) {
      report[host] = err instanceof Error ? err.message : "fail";
    }
  }
  return report;
}

function errorDetail(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
  const code = cause?.code ? ` [${cause.code}]` : "";
  const extra = cause?.message && cause.message !== err.message ? ` (${cause.message})` : "";
  return `${err.message}${code}${extra}`;
}

let lastGoodUrl: string | null = null;
let lastGoodHost: string | null = null;

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
  const dns6 = await dns6Report();
  const attempts = await buildAttempts(suffix);
  const ordered =
    lastGoodUrl && lastGoodHost
      ? [
          { label: lastGoodHost, url: lastGoodUrl, hostHeader: lastGoodHost },
          ...attempts.filter((a) => a.url !== lastGoodUrl),
        ]
      : attempts;

  let lastErr = attempts.length ? "sem destino" : "nenhum host interno com A/AAAA";
  let lastLabel = ordered[0]?.label ?? "";
  for (const attempt of ordered) {
    lastLabel = attempt.label;
    try {
      const upstream = await undiciFetch(attempt.url, {
        method,
        headers: { ...headers, host: attempt.hostHeader },
        body,
        dispatcher: upstreamAgent,
        redirect: "manual",
      });
      lastGoodUrl = attempt.url;
      lastGoodHost = attempt.hostHeader;
      const buf = Buffer.from(await upstream.arrayBuffer());
      const out = new NextResponse(buf, { status: upstream.status });
      const upstreamType = upstream.headers.get("content-type");
      const disposition = upstream.headers.get("content-disposition");
      if (upstreamType) out.headers.set("content-type", upstreamType);
      if (disposition) out.headers.set("content-disposition", disposition);
      return out;
    } catch (err) {
      lastErr = errorDetail(err);
      if (attempt.url === lastGoodUrl) {
        lastGoodUrl = null;
        lastGoodHost = null;
      }
      console.error(`[aion] proxy API falhou target=${attempt.label} ${lastErr}`);
    }
  }

  return NextResponse.json(
    {
      message:
        "API inacessível. Tente de novo em instantes. Se persistir, o serviço da API pode estar fora do ar.",
      target: lastLabel,
      reason: lastErr,
      tried: ordered.map((a) => a.label),
      configuredHost: parseConfiguredUrl()?.hostname ?? null,
      webPrivateDomain: process.env.RAILWAY_PRIVATE_DOMAIN ?? null,
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
