/**
 * Destino do proxy /api/*.
 *
 * O host:porta explícito vem só de API_INTERNAL_URL ou, na falta dela,
 * de API_INTERNAL_HOST + API_INTERNAL_PORT. Comparação é igualdade exata
 * (sem sufixo, sem curinga). Host, X-Forwarded-Host, path e query da
 * requisição não entram aqui.
 *
 * Host Railway (*.railway.internal / *.railway.app), ou env vazia, devolve
 * o caminho legado — o mesmo de quando essas variáveis não existem.
 *
 * https não entra no atalho privado: não reescrevemos `https://host` para
 * `http://host:443`. https segue no classificador público já existente.
 * URL com username ou password é recusada. O ponto final do host
 * (`localhost.`) sai antes da comparação.
 *
 * Host que não é Railway e foi recusado (IP, localhost, metadata, userinfo)
 * não cai no legado: `planejarAtalhoPrivado` pede HTTP 502 e zero tentativas.
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

export type PlanoAtalhoPrivado =
  | { acao: "legado" }
  | { acao: "explicita"; url: string; host: string; port: string }
  | { acao: "recusada"; status: 502; tentativas: readonly [] };

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
  const classe = classificarDestino(env);
  if (classe.tipo !== "explicito") return null;
  return { hostname: classe.host, port: classe.port };
}

/**
 * legado: env vazia, host Railway, https público ou host válido sem porta.
 * explicita: http com host:porta exatos, fora do Railway.
 * recusada: host não-Railway bloqueado ou URL com userinfo. O proxy responde 502
 * e não monta tentativa nenhuma (nem o legado, nem fetch).
 */
export function planejarAtalhoPrivado(env: DestinoEnv, pathSuffix: string): PlanoAtalhoPrivado {
  const classe = classificarDestino(env);
  if (classe.tipo === "recusado") {
    return { acao: "recusada", status: 502, tentativas: [] };
  }
  if (classe.tipo === "explicito") {
    const base = `http://${classe.host}:${classe.port}`;
    return {
      acao: "explicita",
      url: `${base}${pathSuffix}`,
      host: classe.host,
      port: classe.port,
    };
  }
  return { acao: "legado" };
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
 * null = legado (Railway, https, env ausente) ou destino recusado.
 * https não vira http na porta 443.
 */
export function urlPrivadaExplicita(env: DestinoEnv): string | null {
  const dest = destinoExplicito(env);
  if (!dest) return null;
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

type ClasseDestino =
  | { tipo: "legado" }
  | { tipo: "recusado" }
  | { tipo: "explicito"; host: string; port: string };

function classificarDestino(env: DestinoEnv): ClasseDestino {
  const rawUrl = env.API_INTERNAL_URL?.trim() ?? "";
  const rawHost = env.API_INTERNAL_HOST?.trim() ?? "";
  if (!rawUrl && !rawHost) return { tipo: "legado" };

  const bruto = rawUrl || (rawHost.includes("://") ? rawHost : `http://${rawHost}`);
  const url = parseLoose(bruto);
  if (!url) return { tipo: "recusado" };

  const host = normalizarHost(url.hostname);
  const railway = hostRailway(host);
  if (url.username !== "" || url.password !== "") {
    return railway ? { tipo: "legado" } : { tipo: "recusado" };
  }
  if (railway) return { tipo: "legado" };
  if (hostBloqueado(host)) return { tipo: "recusado" };
  // https fica de fora do atalho privado (não reescreve para http:443).
  if (url.protocol === "https:") return { tipo: "legado" };
  if (url.protocol !== "http:") return { tipo: "recusado" };

  if (!rawUrl) {
    const informado = env.API_INTERNAL_PORT?.trim() ?? "";
    if (!informado) return { tipo: "legado" };
    const port = portaTexto(informado);
    if (!port) return { tipo: "legado" };
    return { tipo: "explicito", host, port };
  }

  const port = portaDaUrl(url);
  if (!port) return { tipo: "recusado" };
  return { tipo: "explicito", host, port };
}

function hostRailway(hostname: string): boolean {
  const h = normalizarHost(hostname);
  return isPrivateRailwayHost(h) || h.endsWith(".up.railway.app") || h.endsWith(".railway.app");
}

function hostBloqueado(hostname: string): boolean {
  return !hostname || isIpLiteral(hostname) || HOSTS_BLOQUEADOS.has(hostname);
}

function normalizarHost(hostname: string): string {
  let h = hostname.trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  while (h.endsWith(".")) h = h.slice(0, -1);
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
