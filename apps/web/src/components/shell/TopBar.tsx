"use client";

import Link from "next/link";
import { clearToken } from "@/lib/api";

interface TopBarProps {
  nome?: string;
  estabelecimentoNome?: string;
  perfil?: string;
}

export function TopBar({ nome, estabelecimentoNome, perfil }: TopBarProps) {
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
            clearToken();
            window.location.href = "/login";
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
