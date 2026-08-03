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

const PRIO: Record<string, { bg: string; color: string }> = {
  URGENTE: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
  ALTA: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
  MEDIA: { bg: "oklch(0.95 0.05 85)", color: "oklch(0.45 0.12 75)" },
  BAIXA: { bg: "oklch(0.94 0.01 250)", color: "oklch(0.45 0.02 250)" },
};

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

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia," : hora < 18 ? "Boa tarde," : "Boa noite,";

  return (
    <MobileFrame title="Início" online={online} pending={pending} onSync={() => void flush()}>
      <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)", marginBottom: 2 }}>{saudacao}</div>
      <div style={{ fontSize: 21, fontWeight: 800, color: "oklch(0.18 0.015 255)", marginBottom: 16 }}>{nome}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 }}>
        <MiniKpi label="Abertas" value={kpis?.abertas ?? "—"} color="oklch(0.4 0.16 255)" />
        <MiniKpi label="Urgentes" value={kpis?.urgentes ?? "—"} color="oklch(0.5 0.16 38)" />
        <MiniKpi label="Hoje" value={kpis?.concluidasHoje ?? "—"} color="oklch(0.4 0.13 150)" />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: "oklch(0.2 0.02 250)" }}>Próximos atendimentos</div>
        <Link href="/mobile/os" style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.55 0.16 255)" }}>
          Ver todas ›
        </Link>
      </div>

      <div style={{ display: "grid", gap: 9, marginBottom: 18 }}>
        {proximos.map((os) => {
          const p = PRIO[os.prioridade] ?? PRIO.MEDIA;
          return (
            <Link
              key={os.numero}
              href={`/mobile/os/${os.numero}`}
              style={{
                background: "white",
                border: "1px solid oklch(0.91 0.006 255)",
                borderRadius: 12,
                padding: 13,
                display: "flex",
                alignItems: "center",
                gap: 11,
              }}
            >
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 9,
                  background: p.bg,
                  flexShrink: 0,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 11,
                  fontWeight: 800,
                  color: p.color,
                }}
              >
                OS
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: "oklch(0.22 0.02 250)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {os.equipamento.nome || os.equipamento.tag}
                </div>
                <div style={{ fontSize: 11.5, color: "oklch(0.55 0.02 250)" }}>
                  {os.codigo ?? `OS-${os.numero}`} · {os.equipamento.setor.nome}
                </div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "3px 7px",
                  borderRadius: 5,
                  background: p.bg,
                  color: p.color,
                  whiteSpace: "nowrap",
                }}
              >
                {os.prioridade}
              </span>
            </Link>
          );
        })}
        {proximos.length === 0 && (
          <div style={{ color: "oklch(0.5 0.02 250)", fontSize: 13, padding: 8 }}>Nenhum atendimento na fila</div>
        )}
      </div>

      <div style={{ fontSize: 14.5, fontWeight: 700, color: "oklch(0.2 0.02 250)", margin: "4px 0 10px" }}>
        Acesso rápido
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <QuickCard href="/mobile/qr" label="Ler QR do Equipamento" />
        <QuickCard href="/mobile/solicitar" label="Abrir Solicitação" />
      </div>
    </MobileFrame>
  );
}

function MiniKpi({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid oklch(0.91 0.006 255)",
        borderRadius: 12,
        padding: "12px 10px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10.5, color: "oklch(0.5 0.02 250)", fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function QuickCard({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        background: "white",
        border: "1px solid oklch(0.91 0.006 255)",
        borderRadius: 12,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "oklch(0.28 0.02 250)" }}>{label}</span>
    </Link>
  );
}
