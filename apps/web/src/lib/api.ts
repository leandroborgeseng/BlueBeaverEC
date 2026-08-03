/**
 * Vazio = same-origin via proxy Next (`/api/*` → API_INTERNAL_URL).
 * Em dev local pode apontar direto: NEXT_PUBLIC_API_URL=http://localhost:3001
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("nexo_token");
}

export function setToken(token: string) {
  localStorage.setItem("nexo_token", token);
}

export function clearToken() {
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

/** Busca binário (PDF) com auth Bearer e devolve Blob. */
export async function fetchBlob(path: string, init?: RequestInit): Promise<Blob> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      headers: {
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
  return res.blob();
}

export { API_URL };
