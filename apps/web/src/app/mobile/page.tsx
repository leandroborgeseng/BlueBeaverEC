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
      <div
        style={{
          background: "linear-gradient(135deg, rgb(0,102,178), oklch(0.45 0.12 250))",
          borderRadius: 16,
          padding: "18px 16px",
          color: "white",
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 600 }}>Olá,</div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>{nome}</div>
        <div style={{ fontSize: 12.5, marginTop: 4, opacity: 0.8 }}>App de campo · Engenharia Clínica</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 }}>
        <MiniKpi label="Abertas" value={kpis?.abertas ?? "—"} />
        <MiniKpi label="Urgentes" value={kpis?.urgentes ?? "—"} accent />
        <MiniKpi label="Hoje" value={kpis?.concluidasHoje ?? "—"} />
      </div>

      <h2 style={{ fontSize: 13, margin: "0 0 8px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: "oklch(0.45 0.02 250)" }}>
        Próximos atendimentos
      </h2>
      <div style={{ display: "grid", gap: 8, marginBottom: 18 }}>
        {proximos.map((os) => (
          <Link
            key={os.numero}
            href={`/mobile/os/${os.numero}`}
            style={{
              background: "white",
              border: "1px solid oklch(0.91 0.006 255)",
              borderLeft: `4px solid ${os.prioridade === "URGENTE" ? "oklch(0.55 0.18 25)" : "oklch(0.64 0.19 38)"}`,
              borderRadius: 12,
              padding: 14,
              fontSize: 13,
              boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong>{os.codigo ?? `OS-${os.numero}`}</strong>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: os.prioridade === "URGENTE" ? "oklch(0.45 0.16 25)" : "oklch(0.45 0.02 250)",
                }}
              >
                {os.prioridade}
              </span>
            </div>
            <div style={{ marginTop: 4 }}>{os.equipamento.tag} — {os.equipamento.nome}</div>
            <div style={{ color: "oklch(0.5 0.02 250)", marginTop: 2 }}>{os.equipamento.setor.nome}</div>
          </Link>
        ))}
        {proximos.length === 0 && (
          <div style={{ color: "oklch(0.5 0.02 250)", fontSize: 13, padding: 12, textAlign: "center" }}>
            Nenhum atendimento na fila
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <MobileLink href="/mobile/os" label="Minhas OS" hint="Fila atribuída a você" />
        <MobileLink href="/mobile/qr" label="Ler QR / Ficha" hint="Consulta rápida do equipamento" />
        <MobileLink href="/mobile/solicitar" label="Abrir Solicitação" hint="Reportar ocorrência" />
        <MobileLink href="/dashboard" label="Ir para Desktop" hint="Abrir módulo completo" />
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
        padding: "12px 8px",
        border: "1px solid oklch(0.91 0.006 255)",
        textAlign: "center",
        boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: "oklch(0.5 0.02 250)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2, color: accent ? "oklch(0.5 0.17 25)" : "inherit" }}>
        {value}
      </div>
    </div>
  );
}

function MobileLink({ href, label, hint }: { href: string; label: string; hint: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        background: "white",
        border: "1px solid oklch(0.91 0.006 255)",
        borderRadius: 12,
        padding: "14px 16px",
        boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 15 }}>{label}</div>
      <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 2 }}>{hint}</div>
    </Link>
  );
}
