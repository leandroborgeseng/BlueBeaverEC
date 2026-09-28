"use client";

import type { ReactNode } from "react";
import { api, clearToken } from "@/lib/api";
import { useCampoCache } from "@/lib/mobile-cache";
import { useOfflineQueue } from "@/lib/offline-queue";
import { irParaDesktop, useSession } from "@/lib/session";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { PageTitle, cardStyle } from "@/components/mobile/ui";

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      style={{
        width: 48,
        height: 28,
        borderRadius: 14,
        border: "none",
        background: on ? "oklch(0.55 0.14 255)" : "oklch(0.88 0.02 250)",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 23 : 3,
          width: 22,
          height: 22,
          borderRadius: 11,
          background: "white",
        }}
      />
    </button>
  );
}

function Row({
  label,
  hint,
  trailing,
}: {
  label: string;
  hint?: string;
  trailing: ReactNode;
}) {
  return (
    <div
      style={{
        ...cardStyle,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div>
        <div style={{ fontWeight: 750 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 3 }}>{hint}</div>}
      </div>
      {trailing}
    </div>
  );
}

export default function MobileConfigPage() {
  const me = useSession();
  const { pending, online, flush } = useOfflineQueue();
  const { offlineMode, autoSync, setOfflineMode, setAutoSync, lastPullAt } = useCampoCache();

  function sair() {
    void api("/auth/logout", { method: "POST" })
      .catch(() => undefined)
      .finally(() => {
        clearToken();
        window.location.href = "/login";
      });
  }

  return (
    <MobileFrame title="Configurações" online={online} pending={pending} onSync={() => void flush()}>
      <PageTitle title="Configurações" subtitle={me?.nome} />

      <div style={{ display: "grid", gap: 8 }}>
        <Row
          label="Modo offline"
          hint="Usa o que já está no aparelho e não envia a fila"
          trailing={<Toggle on={offlineMode} onChange={setOfflineMode} />}
        />
        <Row
          label="Sincronização automática"
          hint="Envia a fila quando a rede voltar"
          trailing={<Toggle on={autoSync} onChange={setAutoSync} />}
        />
        <Row
          label="Tipo de código"
          hint="QR e código de barras"
          trailing={<span style={{ fontWeight: 700, fontSize: 13 }}>Ambos</span>}
        />
        <Row
          label="Último download"
          trailing={
            <span style={{ fontSize: 12, fontWeight: 650, color: "oklch(0.45 0.02 250)", textAlign: "right" }}>
              {lastPullAt ? new Date(lastPullAt).toLocaleString("pt-BR") : "—"}
            </span>
          }
        />
      </div>

      <button
        type="button"
        onClick={() => irParaDesktop(me?.perfil)}
        style={{
          width: "100%",
          marginTop: 16,
          border: "1px solid var(--aion-border-soft)",
          background: "white",
          borderRadius: 12,
          padding: "12px 14px",
          fontSize: 14,
          fontWeight: 800,
        }}
      >
        Abrir versão desktop
      </button>

      <button
        type="button"
        onClick={sair}
        style={{
          width: "100%",
          marginTop: 10,
          border: "none",
          background: "oklch(0.55 0.16 38)",
          color: "white",
          borderRadius: 12,
          padding: 14,
          fontSize: 15,
          fontWeight: 800,
        }}
      >
        Sair do app
      </button>
    </MobileFrame>
  );
}
