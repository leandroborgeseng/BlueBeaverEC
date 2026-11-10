/**
 * Destino do proxy /api/*.
 *
 * O host:porta explícito vem só de API_INTERNAL_URL ou, na falta dela,
 * de API_INTERNAL_HOST + API_INTERNAL_PORT. Comparação é igualdade exata
 * (sem sufixo, sem curinga). Host, X-Forwarded-Host, path e query da
 * requisição não entram aqui.
 *
 * Host Railway (*.railway.internal / *.railway.app) devolve null em
 * `urlPrivadaExplicita` para o route.ts seguir o caminho legado, idêntico
 * ao de quando essas variáveis não existem.
 */

export type DestinoEnv = {
  API_INTERNAL_URL?: string | undefined;
  API_INTERNAL_HOST?: string | undefined;
  API_INTERNAL_PORT?: string | undefined;
};

export type DestinoExplicito = {
  hostname: string;
  port: string;
};

const HOSTS_BLOQUEADOS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "169.254.169.254",
]);

export function isSelfWebHost(hostname: string) {
  const h = hostname.toLowerCase();
  return h === "hef.aion.eng.br" || h === "localhost" || h === "127.0.0.1" || h === "::1";
}

export function isPrivateRailwayHost(hostname: string) {
  return hostname.toLowerCase().endsWith(".railway.internal");
}

export function isPublicApiUrl(url: URL) {
  const h = url.hostname.toLowerCase();
  if (isSelfWebHost(h) || isPrivateRailwayHost(h)) return false;
  if (url.protocol === "https:") return true;
  return h.endsWith(".up.railway.app") || h.endsWith(".railway.app");
}

export function destinoExplicito(env: DestinoEnv): DestinoExplicito | null {
  const rawUrl = env.API_INTERNAL_URL?.trim();
  if (rawUrl) {
    const url = parseLoose(rawUrl);
    if (!url) return null;
    const port = portaDaUrl(url);
    if (!port) return null;
    return destinoAceitavel(url.hostname, port);
  }

  const host = env.API_INTERNAL_HOST?.trim();
  const port = env.API_INTERNAL_PORT?.trim();
  if (!host || !port) return null;
  const url = parseLoose(host.includes("://") ? host : `http://${host}`);
  if (!url) return null;
  const porta = portaTexto(port);
  if (!porta) return null;
  return destinoAceitavel(url.hostname, porta);
}

/** true só se hostname e porta são exatamente o destino explícito do env. */
export function aceitaDestinoExplicito(hostname: string, port: string, env: DestinoEnv): boolean {
  const dest = destinoExplicito(env);
  if (!dest) return false;
  const h = normalizarHost(hostname);
  if (!h || isIpLiteral(h) || HOSTS_BLOQUEADOS.has(h)) return false;
  const p = portaTexto(port);
  if (!p) return false;
  return h === dest.hostname && p === dest.port;
}

/**
 * URL http://host:porta para o atalho Coolify.
 * null mantém o proxy no comportamento legado (Railway ou env ausente).
 */
export function urlPrivadaExplicita(env: DestinoEnv): string | null {
  const dest = destinoExplicito(env);
  if (!dest) return null;
  if (hostRailwayLegado(dest.hostname)) return null;
  return `http://${dest.hostname}:${dest.port}`;
}

export function tentativaPrivadaExplicita(
  pathSuffix: string,
  env: DestinoEnv,
): { url: string; host: string; port: string } | null {
  const base = urlPrivadaExplicita(env);
  if (!base) return null;
  const u = new URL(base);
  return {
    url: `${base}${pathSuffix}`,
    host: u.hostname,
    port: u.port,
  };
}

function hostRailwayLegado(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return isPrivateRailwayHost(h) || h.endsWith(".up.railway.app") || h.endsWith(".railway.app");
}

function destinoAceitavel(hostname: string, port: string): DestinoExplicito | null {
  const h = normalizarHost(hostname);
  const p = portaTexto(port);
  if (!h || !p) return null;
  if (isIpLiteral(h) || HOSTS_BLOQUEADOS.has(h)) return null;
  return { hostname: h, port: p };
}

function normalizarHost(hostname: string): string {
  let h = hostname.trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  return h;
}

function isIpLiteral(hostname: string): boolean {
  if (hostname.includes(":")) return true;
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!part || part.length > 3) return false;
    for (const ch of part) {
      if (ch < "0" || ch > "9") return false;
    }
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

function portaTexto(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  for (const ch of trimmed) {
    if (ch < "0" || ch > "9") return null;
  }
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0 || n >= 65536) return null;
  return String(n);
}

function portaDaUrl(url: URL): string | null {
  if (url.port) return portaTexto(url.port);
  if (url.protocol === "https:") return "443";
  if (url.protocol === "http:") return "80";
  return null;
}

function parseLoose(raw: string): URL | null {
  let s = raw.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) s = `http://${s}`;
  while (s.endsWith("/")) s = s.slice(0, -1);
  if (s.toLowerCase().endsWith("/api")) s = s.slice(0, -4);
  try {
    return new URL(s);
  } catch {
    return null;
  }
}
