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
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Falha no login");
      setToken(body.accessToken);
      router.push("/dashboard");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "linear-gradient(160deg, oklch(0.4 0.15 258) 0%, oklch(0.26 0.13 262) 100%)",
        padding: 24,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: 400,
          background: "white",
          borderRadius: 16,
          padding: "40px 36px",
          boxShadow: "0 30px 60px -20px rgba(0,0,0,0.4)",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 28, color: "var(--nexo-brand)" }}>Nexo</div>
        <div style={{ fontSize: 13, color: "var(--nexo-muted)", marginBottom: 28 }}>
          Gestão de Engenharia Clínica
        </div>

        <label style={label}>E-mail</label>
        <input style={input} value={email} onChange={(e) => setEmail(e.target.value)} />

        <label style={{ ...label, marginTop: 14 }}>Senha</label>
        <input
          style={input}
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />

        {erro && (
          <div style={{ marginTop: 12, color: "var(--nexo-danger)", fontSize: 13 }}>{erro}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 22,
            width: "100%",
            border: "none",
            borderRadius: 10,
            padding: "12px 14px",
            background: "var(--nexo-primary)",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>

        <p style={{ marginTop: 16, fontSize: 12, color: "var(--nexo-muted)", lineHeight: 1.5 }}>
          Demo: engenheiro@nexo.local · tecnico@nexo.local · senha nexo1234
        </p>
      </form>
    </div>
  );
}

const label: React.CSSProperties = {
  display: "block",
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
};
