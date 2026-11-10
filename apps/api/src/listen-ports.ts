/**
 * Uma porta HTTP só.
 *
 * PORT definido (Coolify e o Railway injetam PORT) escuta somente nele.
 * Sem PORT, usa API_PORT. Sem os dois, 3001.
 *
 * Não abre 3001 em paralelo com PORT: o healthcheck do Railway acompanha
 * a porta da plataforma, e o gateway nixpacks (`apps/api/start-api.mjs`)
 * já ocupa a porta pública e aponta o Nest para um único PORT. A 3001
 * extra é o EADDRINUSE que o Coolify encontrou.
 */
export function listenPorts(
  env: { PORT?: string | undefined; API_PORT?: string | undefined } = process.env,
): number[] {
  const fromPort = portaDefinida(env.PORT);
  if (fromPort !== undefined) return fromPort === null ? [] : [fromPort];
  const fromApi = portaDefinida(env.API_PORT);
  if (fromApi !== undefined) return fromApi === null ? [] : [fromApi];
  return [3001];
}

/** undefined = ausente ou em branco; null = presente e inválida. */
function portaDefinida(value: string | undefined): number | null | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!somenteDigitos(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0 || n >= 65536) return null;
  return n;
}

function somenteDigitos(value: string): boolean {
  for (const ch of value) {
    if (ch < "0" || ch > "9") return false;
  }
  return true;
}
