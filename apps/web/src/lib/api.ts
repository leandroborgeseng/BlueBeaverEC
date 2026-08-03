/**
 * Vazio = same-origin via proxy Next (`/api/*` → API_INTERNAL_URL).
 * Em dev local pode apontar direto: NEXT_PUBLIC_API_URL=http://localhost:3001
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const current = localStorage.getItem("aion_token");
  if (current) return current;
  // migração one-shot do token antigo
  const legacy = localStorage.getItem("nexo_token");
  if (legacy) {
    localStorage.setItem("aion_token", legacy);
    localStorage.removeItem("nexo_token");
    return legacy;
  }
  return null;
}

export function setToken(token: string) {
  localStorage.setItem("aion_token", token);
  localStorage.removeItem("nexo_token");
}

export function clearToken() {
  localStorage.removeItem("aion_token");
  localStorage.removeItem("nexo_token");
}

function apiUrl(path: string) {
  return `${API_URL}/api${path}`;
}

function networkError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : "Erro de rede";
  const target = API_URL || "(same-origin /api)";
  return new Error(
    `Não foi possível alcançar a API em ${target}. ${msg}. Verifique se a API está no ar e se API_INTERNAL_URL (web) ou NEXT_PUBLIC_API_URL estão corretos.`,
  );
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw networkError(err);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Erro ${res.status}`);
  }

  return res.json() as Promise<T>;
}

async function fetchBinary(path: string, init?: RequestInit): Promise<{ blob: Blob; filename?: string }> {
  const token = getToken();
  const method = (init?.method ?? "GET").toUpperCase();
  const hasBody = init?.body != null && method !== "GET" && method !== "HEAD";
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    throw networkError(err);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `Erro ${res.status}`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/i.exec(cd);
  return { blob, filename: match?.[1] };
}

/** Busca binário (PDF) com auth Bearer e devolve Blob. */
export async function fetchBlob(path: string, init?: RequestInit): Promise<Blob> {
  const { blob } = await fetchBinary(path, init);
  return blob;
}

/** Download binário (PDF/XLSX) com auth Bearer. */
export async function downloadApi(path: string, init?: RequestInit, fallbackName = "download.bin") {
  const { blob, filename } = await fetchBinary(path, init);
  const name = filename ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return name;
}

export { API_URL };
