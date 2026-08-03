"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("engenheiro@nexo.local");
  const [senha, setSenha] = useState("nexo1234");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? `Falha no login (${res.status})`);
      setToken(body.accessToken);
      router.push("/dashboard");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro";
      const target = API_URL || "/api (proxy)";
      setErro(
        /load failed|failed to fetch|networkerror/i.test(msg)
          ? `Sem conexão com a API (${target}). Confira se @nexo/api está online e se o web tem API_INTERNAL_URL.`
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, oklch(0.4 0.15 258) 0%, oklch(0.26 0.13 262) 100%)",
        padding: 24,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: 400,
          background: "oklch(1 0 0)",
          borderRadius: 16,
          padding: "40px 36px",
          boxShadow: "0 30px 60px -20px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <img
            src="/bluebeaver-logo.png"
            alt="BlueBeaver"
            style={{ height: 34, borderRadius: 6 }}
          />
        </div>
        <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)", marginBottom: 28 }}>
          Gestão de Engenharia Clínica
        </div>

        <div style={label}>USUÁRIO</div>
        <input
          style={input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />

        <div style={{ ...label, marginTop: 14 }}>SENHA</div>
        <input
          style={input}
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="current-password"
        />

        <div style={{ textAlign: "right", marginBottom: 8, marginTop: 8 }}>
          <span style={{ fontSize: 12.5, color: "oklch(0.55 0.16 255)" }}>Esqueci minha senha</span>
        </div>

        {erro && (
          <div style={{ marginTop: 8, color: "oklch(0.45 0.15 25)", fontSize: 13 }}>{erro}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 12,
            width: "100%",
            border: "none",
            borderRadius: 10,
            padding: 12,
            background: "oklch(0.64 0.19 38)",
            color: "white",
            fontSize: 14.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>

        <div
          style={{
            textAlign: "center",
            marginTop: 22,
            fontSize: 11.5,
            color: "oklch(0.65 0.01 250)",
          }}
        >
          © 2026 BlueBeaver · demo: engenheiro@nexo.local / nexo1234
        </div>
      </form>
    </div>
  );
}

const label: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "oklch(0.45 0.02 250)",
  marginBottom: 6,
};

const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid oklch(0.88 0.01 250)",
  borderRadius: 10,
  padding: "11px 14px",
  fontSize: 14,
  color: "oklch(0.3 0.02 250)",
};
