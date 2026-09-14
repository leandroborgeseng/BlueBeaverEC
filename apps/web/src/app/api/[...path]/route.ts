import { resolve4, resolve6 } from "node:dns/promises";
import { NextRequest, NextResponse } from "next/server";
import { Agent, fetch as undiciFetch } from "undici";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_API_PORT = "3001";
const PRIVATE_CONNECT_MS = 1_500;
const PUBLIC_CONNECT_MS = 8_000;
const DNS_MS = 800;

const privateAgent = new Agent({
  connect: { timeout: PRIVATE_CONNECT_MS, autoSelectFamily: true },
  connectTimeout: PRIVATE_CONNECT_MS,
});

const publicAgent = new Agent({
  connect: { timeout: PUBLIC_CONNECT_MS, autoSelectFamily: true },
  connectTimeout: PUBLIC_CONNECT_MS,
});

const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_ID || process.env.RAILWAY_PROJECT_ID,
);

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isSelfWebHost(hostname: string) {
  const h = hostname.toLowerCase();
  return h === "hef.aion.eng.br" || h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function stripHost(raw: string) {
  return raw.replace(/^https?:\/\//, "").replace(/\/$/, "").split("/")[0].split(":")[0];
}

function parseMaybeUrl(raw?: string | null): URL | null {
  let s = raw?.trim() || "";
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  s = s.replace(/\/+$/, "").replace(/\/api$/i, "");
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

function isPrivateRailwayHost(hostname: string) {
  return hostname.toLowerCase().endsWith(".railway.internal");
}

function isPublicApiUrl(url: URL) {
  const h = url.hostname.toLowerCase();
  if (isSelfWebHost(h) || isPrivateRailwayHost(h)) return false;
  if (url.protocol === "https:") return true;
  return h.endsWith(".up.railway.app") || h.endsWith(".railway.app");
}

function originOf(url: URL) {
  const port = url.port ? `:${url.port}` : "";
  return `${url.protocol}//${url.hostname}${port}`;
}

function envUrls(): { key: string; url: URL }[] {
  const pairs: { key: string; raw: string }[] = [];
  const push = (key: string, raw?: string) => {
    const v = raw?.trim();
    if (v) pairs.push({ key, raw: v });
  };
  push("API_PUBLIC_URL", process.env.API_PUBLIC_URL);
  push("API_INTERNAL_URL", process.env.API_INTERNAL_URL);
  push("API_RAILWAY_URL", process.env.API_RAILWAY_URL);
  for (const [key, value] of Object.entries(process.env)) {
    if (/^RAILWAY_SERVICE_.+URL$/i.test(key)) push(key, value);
  }
  const out: { key: string; url: URL }[] = [];
  const seen = new Set<string>();
  for (const { key, raw } of pairs) {
    const url = parseMaybeUrl(raw);
    if (!url || isSelfWebHost(url.hostname)) continue;
    const href = originOf(url);
    if (seen.has(href)) continue;
    seen.add(href);
    out.push({ key, url });
  }
  return out;
}

function publicOrigins() {
  return envUrls().filter((e) => isPublicApiUrl(e.url));
}

function privateConfiguredUrl() {
  return envUrls().find((e) => !isPublicApiUrl(e.url))?.url ?? null;
}

function parseConfiguredUrl() {
  return parseMaybeUrl(process.env.API_INTERNAL_URL);
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
    const asApi = host.replace(/-web(?=\.|$)/g, "-api").replace(/web(?=\.|$)/gi, "api");
    if (asApi !== host) out.push(asApi);
  }
  return out;
}

function hostnameCandidates(): string[] {
  const hosts: string[] = [];
  const fromHost = process.env.API_INTERNAL_HOST?.trim();
  if (fromHost) hosts.push(stripHost(fromHost));
  const configured = privateConfiguredUrl() ?? parseConfiguredUrl();
  if (configured && isPrivateRailwayHost(configured.hostname) && !isSelfWebHost(configured.hostname)) {
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
  return unique(hosts).filter((h) => !isSelfWebHost(h) && !h.endsWith(".up.railway.app"));
}

function portCandidates(): string[] {
  const configured = privateConfiguredUrl() ?? parseConfiguredUrl();
  const configuredPort = configured && isPrivateRailwayHost(configured.hostname) ? configured.port : "";
  return unique([
    configuredPort,
    process.env.API_INTERNAL_PORT?.trim() ?? "",
    DEFAULT_API_PORT,
    "8080",
    "3000",
  ]);
}

const dnsCache = new Map<string, Promise<string[]>>();

async function resolveIps(hostname: string): Promise<string[]> {
  const cached = dnsCache.get(hostname);
  if (cached) return cached;
  const pending = (async () => {
    if (hostname.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return [hostname];
    }
    const [v6, v4] = await Promise.all([
      withTimeout(resolve6(hostname).catch(() => [] as string[]), DNS_MS, [] as string[]),
      withTimeout(resolve4(hostname).catch(() => [] as string[]), DNS_MS, [] as string[]),
    ]);
    return unique([...v6.map((ip) => `[${ip}]`), ...v4]);
  })();
  dnsCache.set(hostname, pending);
  return pending;
}

type Attempt = {
  label: string;
  url: string;
  hostHeader?: string;
  publicHttps: boolean;
  timeoutMs: number;
};

function publicAttempts(pathSuffix: string): Attempt[] {
  return publicOrigins().map(({ url }) => {
    const origin = originOf(url);
    const https = url.protocol === "https:" || url.hostname.endsWith(".up.railway.app");
    const originHttp = https ? origin.replace(/^http:/, "https:") : origin;
    return {
      label: `${url.hostname}${url.port ? `:${url.port}` : ""}`,
      url: `${originHttp}${pathSuffix}`,
      publicHttps: https,
      timeoutMs: PUBLIC_CONNECT_MS,
    };
  });
}

async function privateAttempts(pathSuffix: string): Promise<Attempt[]> {
  const attempts: Attempt[] = [];
  const configured = privateConfiguredUrl() ?? parseConfiguredUrl();
  if (configured && isPrivateRailwayHost(configured.hostname)) {
    const port = configured.port || process.env.API_INTERNAL_PORT?.trim() || DEFAULT_API_PORT;
    attempts.push({
      label: `${configured.hostname}:${port}`,
      url: `http://${configured.hostname}:${port}${pathSuffix}`,
      hostHeader: configured.hostname,
      publicHttps: false,
      timeoutMs: PRIVATE_CONNECT_MS,
    });
  }

  for (const hostname of hostnameCandidates()) {
    const ips = await resolveIps(hostname);
    if (!ips.length) continue;
    for (const port of portCandidates()) {
      attempts.push({
        label: `${hostname}:${port}`,
        url: `http://${hostname}:${port}${pathSuffix}`,
        hostHeader: hostname,
        publicHttps: false,
        timeoutMs: PRIVATE_CONNECT_MS,
      });
      for (const ip of ips) {
        attempts.push({
          label: `${hostname}:${port}`,
          url: `http://${ip}:${port}${pathSuffix}`,
          hostHeader: hostname,
          publicHttps: false,
          timeoutMs: PRIVATE_CONNECT_MS,
        });
      }
    }
  }
  const seen = new Set<string>();
  return attempts.filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });
}

async function buildAttempts(pathSuffix: string): Promise<Attempt[]> {
  const pub = publicAttempts(pathSuffix);
  if (pub.length) return pub;
  const priv = await privateAttempts(pathSuffix);
  return priv.slice(0, 8);
}

async function dns6Report() {
  const configured = parseConfiguredUrl()?.hostname;
  const own = process.env.RAILWAY_PRIVATE_DOMAIN?.trim();
  const report: Record<string, string> = {};
  for (const host of unique([configured, own, ...hostnameCandidates().slice(0, 3)].filter(Boolean) as string[])) {
    const ips = await resolveIps(host);
    report[host] = ips.length ? ips.slice(0, 2).join(",") : "sem A/AAAA";
  }
  return report;
}

function errorDetail(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { code?: string; cause?: { code?: string; message?: string } }).cause;
  const code = (err as Error & { code?: string }).code || cause?.code;
  const codePart = code ? ` [${code}]` : "";
  const extra = cause?.message && cause.message !== err.message ? ` (${cause.message})` : "";
  return `${err.message}${codePart}${extra}`;
}

function apiInternalUrlHost() {
  const u = parseConfiguredUrl();
  if (!u) return null;
  return `${u.hostname}${u.port ? `:${u.port}` : ""}`;
}

function apiPublicUrlHost() {
  const u = parseMaybeUrl(process.env.API_PUBLIC_URL);
  if (!u) return publicOrigins()[0] ? `${publicOrigins()[0].url.hostname}` : null;
  return `${u.hostname}${u.port ? `:${u.port}` : ""}`;
}

let lastGoodOrigin: string | null = null;
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
    lastGoodOrigin && lastGoodHost
      ? [
          {
            label: lastGoodHost,
            url: `${lastGoodOrigin}${suffix}`,
            hostHeader: lastGoodHost,
            publicHttps: lastGoodOrigin.startsWith("https:"),
            timeoutMs: lastGoodOrigin.startsWith("https:") ? PUBLIC_CONNECT_MS : PRIVATE_CONNECT_MS,
          },
          ...attempts.filter((a) => a.url !== `${lastGoodOrigin}${suffix}`),
        ]
      : attempts;

  let lastErr = attempts.length ? "sem destino" : "nenhum host interno com A/AAAA nem URL pública";
  let lastLabel = ordered[0]?.label ?? "";
  const failures: { target: string; error: string }[] = [];
  let triedPublicHttps = false;

  for (const attempt of ordered) {
    lastLabel = attempt.label;
    if (attempt.publicHttps) triedPublicHttps = true;
    try {
      const reqHeaders = { ...headers };
      if (attempt.hostHeader && !attempt.publicHttps) reqHeaders.host = attempt.hostHeader;
      const upstream = await undiciFetch(attempt.url, {
        method,
        headers: reqHeaders,
        body,
        dispatcher: attempt.publicHttps ? publicAgent : privateAgent,
        redirect: "manual",
        signal: AbortSignal.timeout(attempt.timeoutMs + 500),
      });
      const u = new URL(attempt.url);
      lastGoodOrigin = `${u.protocol}//${u.host}`;
      lastGoodHost = attempt.hostHeader ?? u.hostname;
      const buf = Buffer.from(await upstream.arrayBuffer());
      const out = new NextResponse(buf, { status: upstream.status });
      const upstreamType = upstream.headers.get("content-type");
      const disposition = upstream.headers.get("content-disposition");
      if (upstreamType) out.headers.set("content-type", upstreamType);
      if (disposition) out.headers.set("content-disposition", disposition);
      return out;
    } catch (err) {
      lastErr = errorDetail(err);
      failures.push({ target: attempt.label, error: lastErr });
      if (lastGoodOrigin && attempt.url.startsWith(lastGoodOrigin)) {
        lastGoodOrigin = null;
        lastGoodHost = null;
      }
      console.error(`[aion] proxy API falhou target=${attempt.label} ${lastErr}`);
    }
  }

  const parsed = parseConfiguredUrl();
  return NextResponse.json(
    {
      message:
        "API inacessível. Tente de novo em instantes. Se persistir, o serviço da API pode estar fora do ar.",
      target: lastLabel,
      reason: lastErr,
      tried: ordered.map((a) => a.label),
      failures: failures.slice(0, 8),
      apiInternalUrlHost: apiInternalUrlHost(),
      apiPublicUrlHost: apiPublicUrlHost(),
      triedPublicHttps,
      parsedProtocol: parsed?.protocol ?? null,
      parsedPort: parsed?.port || null,
      configuredHost: parsed?.hostname ?? null,
      webPrivateDomain: process.env.RAILWAY_PRIVATE_DOMAIN ?? null,
      dns6,
      webService: process.env.RAILWAY_SERVICE_NAME ?? null,
      nextStep:
        "TCP privado Railway está morto. @nexo/api → Networking → Generate Domain; @nexo/web → API_INTERNAL_URL ou API_PUBLIC_URL = https://….up.railway.app; Redeploy @nexo/web.",
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
