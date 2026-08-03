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
  const [panel, setPanel] = useState<"perfil" | "notif" | "busca" | null>(null);
  const [q, setQ] = useState("");

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
    width: 32,
    height: 32,
    border: "none",
    background: "transparent",
    borderRadius: 6,
    cursor: "pointer",
    color: "oklch(0.5 0.05 255)",
    display: "grid",
    placeItems: "center",
    position: "relative",
    padding: 0,
  };

  return (
    <header
      style={{
        height: 58,
        flexShrink: 0,
        borderBottom: "1px solid oklch(0.91 0.006 255)",
        background: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "0 22px",
        position: "relative",
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <img src="/bluebeaver-logo.png" alt="" style={{ height: 26, borderRadius: 5 }} />
        <div style={{ width: 1, height: 18, background: "oklch(0.91 0.006 255)", flexShrink: 0 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, color: "oklch(0.32 0.015 255)" }}>
          <Icon d={ICONS.building} size={15} />
          {estabelecimentos.length > 1 ? (
            <select
              value={estabelecimentoId}
              onChange={(e) => void trocar(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                fontSize: 13.5,
                fontWeight: 600,
                color: "oklch(0.32 0.015 255)",
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
            <span style={{ fontSize: 13.5, fontWeight: 600 }}>{estabelecimentoNome ?? "Estabelecimento"}</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <button
          type="button"
          title="Busca global"
          style={iconBtn}
          onClick={() => setPanel((p) => (p === "busca" ? null : "busca"))}
        >
          <Icon d={ICONS.search} size={18} />
        </button>
        <button type="button" title="Favoritos" style={iconBtn}>
          <Icon d={ICONS.star} size={18} />
        </button>
        <button type="button" title="Recentes" style={iconBtn}>
          <Icon d={ICONS.clock} size={18} />
        </button>
        <button type="button" title="Ajuda" style={iconBtn}>
          <Icon d={ICONS.help} size={18} />
        </button>
        <button
          type="button"
          title="Notificações"
          style={{ ...iconBtn, marginRight: 8 }}
          onClick={() => setPanel((p) => (p === "notif" ? null : "notif"))}
        >
          <Icon d={ICONS.bell} size={18} />
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 5,
              width: 8,
              height: 8,
              borderRadius: 99,
              background: "oklch(0.6 0.19 25)",
              border: "1.5px solid white",
            }}
          />
        </button>

        <button
          type="button"
          onClick={() => setPanel((p) => (p === "perfil" ? null : "perfil"))}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            border: "1px solid oklch(0.88 0.008 255)",
            background: "white",
            cursor: "pointer",
            padding: "4px 9px",
            borderRadius: 6,
          }}
        >
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "oklch(0.35 0.02 250)" }}>{perfil ?? "Perfil"}</span>
          <span style={{ fontSize: 10, color: "oklch(0.55 0.02 250)" }}>▾</span>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              background: "oklch(0.55 0.16 255)",
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
              top: 54,
              right: panel === "busca" ? 120 : 12,
              width: panel === "busca" ? 320 : panel === "perfil" ? 240 : 300,
              background: "white",
              border: "1px solid oklch(0.91 0.006 255)",
              borderRadius: 10,
              boxShadow: "0 18px 40px -20px rgba(16,24,40,0.35)",
              zIndex: 41,
              padding: 8,
            }}
          >
            {panel === "busca" ? (
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar equipamentos, OS, contratos…"
                style={{
                  width: "100%",
                  border: "1px solid oklch(0.87 0.008 255)",
                  borderRadius: 7,
                  padding: "9px 10px",
                  fontSize: 13,
                }}
              />
            ) : panel === "perfil" ? (
              <>
                <div style={{ padding: "10px 12px", borderBottom: "1px solid oklch(0.93 0.005 255)" }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{nome}</div>
                  <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 2 }}>{perfil}</div>
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
                    borderRadius: 7,
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
