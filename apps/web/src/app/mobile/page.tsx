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

interface Prox {
  numero: number;
  codigo: string | null;
  prioridade: string;
  equipamento: { tag: string; nome: string; setor: { nome: string } };
}

export default function MobileHomePage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [proximos, setProximos] = useState<Prox[]>([]);
  const [nome, setNome] = useState("Técnico");
  const { pending, online, flush } = useOfflineQueue();

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/login";
      return;
    }
    api<{ nome: string }>("/session/me")
      .then((s) => {
        if (s.nome) setNome(s.nome.split(" ")[0]);
      })
      .catch(() => undefined);
    api<Kpis>("/mobile/kpis-hoje").then(setKpis).catch(() => setKpis({ abertas: 0, urgentes: 0, concluidasHoje: 0 }));
    api<Prox[]>("/mobile/proximos?limit=5").then(setProximos).catch(() => setProximos([]));
  }, []);

  return (
    <MobileFrame title="Início" online={online} pending={pending} onSync={() => void flush()}>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 14 }}>
        Olá, {nome} — app de campo
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 }}>
        <MiniKpi label="Abertas" value={kpis?.abertas ?? "—"} />
        <MiniKpi label="Urgentes" value={kpis?.urgentes ?? "—"} accent />
        <MiniKpi label="Hoje" value={kpis?.concluidasHoje ?? "—"} />
      </div>

      <h2 style={{ fontSize: 14, margin: "0 0 8px" }}>Próximos atendimentos</h2>
      <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
        {proximos.map((os) => (
          <Link
            key={os.numero}
            href={`/mobile/os/${os.numero}`}
            style={{
              background: "white",
              border: "1px solid var(--nexo-border)",
              borderLeft: `4px solid ${os.prioridade === "URGENTE" ? "var(--nexo-danger)" : "var(--nexo-primary)"}`,
              borderRadius: 12,
              padding: 12,
              fontSize: 13,
            }}
          >
            <strong>{os.codigo ?? `OS-${os.numero}`}</strong> · {os.equipamento.tag}
            <div style={{ color: "var(--nexo-muted)" }}>{os.equipamento.setor.nome}</div>
          </Link>
        ))}
        {proximos.length === 0 && <div style={{ color: "var(--nexo-muted)", fontSize: 13 }}>Nenhum atendimento na fila</div>}
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
    <div style={{ background: "white", borderRadius: 12, padding: 12, border: "1px solid var(--nexo-border)", textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "var(--nexo-muted)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ? "var(--nexo-danger)" : "inherit" }}>{value}</div>
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
