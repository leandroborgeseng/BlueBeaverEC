"use client";

import { api, setToken } from "@/lib/api";
import { labelPerfil, useSession } from "@/lib/session";

export function ImpersonationBanner() {
  const me = useSession();
  if (!me?.impersonadoPor) return null;

  async function voltar() {
    const res = await api<{ accessToken: string }>("/auth/stop-impersonation", { method: "POST" });
    setToken(res.accessToken);
    window.location.href = "/dashboard";
  }

  return (
    <div
      style={{
        flexShrink: 0,
        background: "oklch(0.55 0.16 38)",
        color: "white",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 13,
        fontWeight: 650,
        zIndex: 50,
      }}
    >
      <span>
        Personificando <strong>{me.nome}</strong> · {labelPerfil(me.perfil)} — original:{" "}
        {me.impersonadoPor.nome}
      </span>
      <button
        type="button"
        onClick={() => void voltar()}
        style={{
          border: "none",
          background: "white",
          color: "oklch(0.45 0.14 38)",
          borderRadius: 8,
          padding: "6px 12px",
          fontWeight: 800,
          fontSize: 12,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Voltar ao meu perfil
      </button>
    </div>
  );
}
