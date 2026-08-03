"use client";

import { useState } from "react";
import { api, clearToken, setToken } from "@/lib/api";
import { ICONS, Icon } from "./icons";

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

function initials(nome?: string) {
  if (!nome) return "NX";
  const parts = nome.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "NX";
}

export function TopBar({
  nome,
  estabelecimentoId,
  estabelecimentoNome,
  perfil,
  estabelecimentos = [],
  onSwitched,
}: TopBarProps) {
  const [panel, setPanel] = useState<"perfil" | "notif" | null>(null);

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

  function logout() {
    void api("/auth/logout", { method: "POST" })
      .catch(() => undefined)
      .finally(() => {
        clearToken();
        window.location.href = "/login";
      });
  }

  const iconBtn: React.CSSProperties = {
    width: 34,
    height: 34,
    border: "none",
    background: "transparent",
    borderRadius: 8,
    cursor: "pointer",
    color: "oklch(0.4 0.02 250)",
    display: "grid",
    placeItems: "center",
    position: "relative",
  };

  return (
    <header
      style={{
        height: 52,
        borderBottom: "1px solid oklch(0.91 0.006 255)",
        background: "white",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px 0 18px",
        position: "relative",
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ color: "oklch(0.45 0.02 250)" }}>
          <Icon d={ICONS.building} size={16} />
        </span>
        {estabelecimentos.length > 1 ? (
          <select
            value={estabelecimentoId}
            onChange={(e) => void trocar(e.target.value)}
            style={{
              border: "none",
              background: "transparent",
              fontSize: 13.5,
              fontWeight: 600,
              color: "oklch(0.28 0.02 250)",
              maxWidth: 320,
              cursor: "pointer",
            }}
          >
            {estabelecimentos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "oklch(0.28 0.02 250)" }}>
            {estabelecimentoNome ?? "Estabelecimento"}
          </span>
        )}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2 }}>
        <button type="button" title="Busca global" style={iconBtn}>
          <Icon d={ICONS.search} size={17} />
        </button>
        <button type="button" title="Favoritos" style={iconBtn}>
          <Icon d={ICONS.star} size={17} />
        </button>
        <button type="button" title="Recentes" style={iconBtn}>
          <Icon d={ICONS.clock} size={17} />
        </button>
        <button type="button" title="Ajuda" style={iconBtn}>
          <Icon d={ICONS.help} size={17} />
        </button>
        <button
          type="button"
          title="Notificações"
          style={iconBtn}
          onClick={() => setPanel((p) => (p === "notif" ? null : "notif"))}
        >
          <Icon d={ICONS.bell} size={17} />
          <span
            style={{
              position: "absolute",
              top: 6,
              right: 7,
              width: 7,
              height: 7,
              borderRadius: 99,
              background: "oklch(0.55 0.2 25)",
              border: "1.5px solid white",
            }}
          />
        </button>

        <button
          type="button"
          onClick={() => setPanel((p) => (p === "perfil" ? null : "perfil"))}
          style={{
            marginLeft: 6,
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: "4px 4px 4px 8px",
            borderRadius: 999,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.3 0.02 250)" }}>
            {perfil ?? "Perfil"}
          </span>
          <span style={{ fontSize: 11, color: "oklch(0.55 0.02 250)" }}>▾</span>
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              background: "oklch(0.55 0.14 255)",
              color: "white",
              display: "grid",
              placeItems: "center",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {initials(nome)}
          </span>
        </button>
      </div>

      {panel && (
        <>
          <div onClick={() => setPanel(null)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            style={{
              position: "absolute",
              top: 48,
              right: 12,
              width: panel === "perfil" ? 240 : 300,
              background: "white",
              border: "1px solid oklch(0.91 0.006 255)",
              borderRadius: 12,
              boxShadow: "0 18px 40px -20px rgba(16,24,40,0.35)",
              zIndex: 41,
              padding: 8,
            }}
          >
            {panel === "perfil" ? (
              <>
                <div style={{ padding: "10px 12px", borderBottom: "1px solid oklch(0.93 0.005 255)" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{nome}</div>
                  <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 2 }}>
                    {perfil}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    background: "transparent",
                    padding: "10px 12px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "oklch(0.45 0.15 25)",
                  }}
                >
                  Sair
                </button>
              </>
            ) : (
              <div style={{ padding: "12px 14px", fontSize: 13, color: "oklch(0.5 0.02 250)" }}>
                Nenhuma notificação nova.
              </div>
            )}
          </div>
        </>
      )}
    </header>
  );
}
