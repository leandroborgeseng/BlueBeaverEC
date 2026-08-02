"use client";

import Link from "next/link";
import { api, clearToken, setToken } from "@/lib/api";

interface Estab {
  id: string;
  nome: string;
  perfil: string;
}

interface TopBarProps {
  nome?: string;
  estabelecimentoId?: string;
  estabelecimentoNome?: string;
  perfil?: string;
  estabelecimentos?: Estab[];
  onSwitched?: () => void;
}

export function TopBar({
  nome,
  estabelecimentoId,
  estabelecimentoNome,
  perfil,
  estabelecimentos = [],
  onSwitched,
}: TopBarProps) {
  async function trocar(id: string) {
    if (!id || id === estabelecimentoId) return;
    const res = await api<{ accessToken: string }>("/auth/switch-estabelecimento", {
      method: "POST",
      body: JSON.stringify({ estabelecimentoId: id }),
    });
    setToken(res.accessToken);
    onSwitched?.();
    window.location.reload();
  }

  return (
    <header
      style={{
        height: 56,
        borderBottom: "1px solid var(--nexo-border)",
        background: "var(--nexo-surface)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 18px",
      }}
    >
      <div style={{ fontWeight: 800, color: "var(--nexo-brand)", fontSize: 18 }}>Nexo</div>
      <input
        placeholder="Busca global…"
        style={{
          flex: 1,
          maxWidth: 420,
          border: "1px solid var(--nexo-border)",
          borderRadius: 10,
          padding: "9px 12px",
          background: "oklch(0.985 0.003 250)",
        }}
      />
      {estabelecimentos.length > 1 ? (
        <select
          value={estabelecimentoId}
          onChange={(e) => void trocar(e.target.value)}
          style={{
            border: "1px solid var(--nexo-border)",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            maxWidth: 260,
          }}
        >
          {estabelecimentos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
      ) : (
        <div
          style={{
            border: "1px solid var(--nexo-border)",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            color: "var(--nexo-muted)",
          }}
        >
          {estabelecimentoNome ?? "Estabelecimento"}
        </div>
      )}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
        <Link href="/mobile" style={{ color: "var(--nexo-brand)", fontWeight: 600 }}>
          Campo
        </Link>
        <span style={{ color: "var(--nexo-muted)" }}>
          {nome ?? "—"} · {perfil ?? "—"}
        </span>
        <button
          type="button"
          onClick={() => {
            void api("/auth/logout", { method: "POST" })
              .catch(() => undefined)
              .finally(() => {
                clearToken();
                window.location.href = "/login";
              });
          }}
          style={{
            border: "1px solid var(--nexo-border)",
            background: "white",
            borderRadius: 8,
            padding: "7px 10px",
            cursor: "pointer",
          }}
        >
          Sair
        </button>
      </div>
    </header>
  );
}
