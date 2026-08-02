"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, getToken } from "@/lib/api";
import { useOfflineQueue } from "@/lib/offline-queue";
import { MobileFrame } from "@/components/mobile/MobileFrame";

interface Kpis {
  abertas: number;
  urgentes: number;
  concluidasHoje: number;
}

export default function MobileHomePage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const { pending, online, flush } = useOfflineQueue();

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    api<Kpis>("/mobile/kpis-hoje").then(setKpis).catch(() => setKpis({ abertas: 0, urgentes: 0, concluidasHoje: 0 }));
  }, []);

  return (
    <MobileFrame title="Início" online={online} pending={pending} onSync={() => void flush()}>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 14 }}>
        App de campo do técnico
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 }}>
        <MiniKpi label="Abertas" value={kpis?.abertas ?? "—"} />
        <MiniKpi label="Urgentes" value={kpis?.urgentes ?? "—"} accent />
        <MiniKpi label="Hoje" value={kpis?.concluidasHoje ?? "—"} />
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <MobileLink href="/mobile/os" label="Minhas OS" />
        <MobileLink href="/mobile/qr" label="Ler QR / Ficha" />
        <MobileLink href="/mobile/solicitar" label="Abrir Solicitação" />
        <MobileLink href="/dashboard" label="Ir para Desktop" />
      </div>
    </MobileFrame>
  );
}

function MiniKpi({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div
      style={{
        background: "white",
        borderRadius: 12,
        padding: 12,
        border: "1px solid var(--nexo-border)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--nexo-muted)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ? "var(--nexo-danger)" : "inherit" }}>
        {value}
      </div>
    </div>
  );
}

function MobileLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        background: "white",
        border: "1px solid var(--nexo-border)",
        borderRadius: 12,
        padding: "14px 16px",
        fontWeight: 700,
        fontSize: 15,
      }}
    >
      {label}
    </Link>
  );
}
