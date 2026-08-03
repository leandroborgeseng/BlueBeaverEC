"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";

interface OsRow {
  id: string;
  numero: number;
  codigo: string;
  prioridade: string;
  status: string;
  atrasada: boolean;
  equipamento: { tag: string; nome: string; setor: { nome: string } };
}

const PRIO: Record<string, { bg: string; color: string }> = {
  URGENTE: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
  ALTA: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
  MEDIA: { bg: "oklch(0.95 0.05 85)", color: "oklch(0.45 0.12 75)" },
  BAIXA: { bg: "oklch(0.94 0.01 250)", color: "oklch(0.45 0.02 250)" },
};

const STATUS: Record<string, { bg: string; color: string }> = {
  ABERTA: { bg: "oklch(0.93 0.04 250)", color: "oklch(0.4 0.14 255)" },
  EM_ANDAMENTO: { bg: "oklch(0.95 0.05 85)", color: "oklch(0.45 0.12 75)" },
  CONCLUIDA: { bg: "oklch(0.94 0.05 150)", color: "oklch(0.4 0.12 150)" },
  ATRASADA: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
};

export default function MobileOsPage() {
  const [items, setItems] = useState<OsRow[]>([]);
  const [filtro, setFiltro] = useState<"TODAS" | "URGENTES" | "ABERTAS">("TODAS");
  const { pending, online, flush } = useOfflineQueue();

  useEffect(() => {
    api<OsRow[]>("/mobile/minhas-os").then(setItems).catch(() => setItems([]));
  }, []);

  const filtered = useMemo(() => {
    if (filtro === "URGENTES") return items.filter((o) => o.prioridade === "URGENTE");
    if (filtro === "ABERTAS") return items.filter((o) => o.status === "ABERTA" || o.status === "EM_ANDAMENTO");
    return items;
  }, [items, filtro]);

  const urgentes = items.filter((o) => o.prioridade === "URGENTE").length;

  return (
    <MobileFrame title="Minhas OS" online={online} pending={pending} onSync={() => void flush()}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "oklch(0.18 0.015 255)", marginBottom: 2 }}>Minhas OS</div>
      <div style={{ fontSize: 12.5, color: "oklch(0.5 0.02 250)", marginBottom: 14 }}>
        {items.length} atribuída(s) para hoje
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        {(["TODAS", "ABERTAS", "URGENTES"] as const).map((f) => {
          const active = filtro === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              style={{
                padding: "6px 12px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                background: active ? "oklch(0.64 0.19 38)" : "white",
                color: active ? "white" : "oklch(0.35 0.02 250)",
                border: `1px solid ${active ? "oklch(0.64 0.19 38)" : "oklch(0.91 0.006 255)"}`,
              }}
            >
              {f}
              {f === "URGENTES" && urgentes > 0 ? ` (${urgentes})` : ""}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((os) => {
          const p = PRIO[os.prioridade] ?? PRIO.MEDIA;
          const st = os.atrasada ? STATUS.ATRASADA : (STATUS[os.status] ?? STATUS.ABERTA);
          return (
            <Link
              key={os.id}
              href={`/mobile/os/${os.numero}`}
              style={{
                background: "white",
                border: "1px solid oklch(0.91 0.006 255)",
                borderRadius: 12,
                padding: 14,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: "oklch(0.22 0.02 250)", flex: 1 }}>
                  {os.equipamento.nome || os.equipamento.tag}
                </div>
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 5,
                    background: p.bg,
                    color: p.color,
                    whiteSpace: "nowrap",
                  }}
                >
                  {os.prioridade}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginBottom: 8 }}>
                {os.codigo} · {os.equipamento.setor.nome}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: "3px 9px",
                    borderRadius: 5,
                    background: st.bg,
                    color: st.color,
                  }}
                >
                  {os.atrasada ? "ATRASADA" : os.status.replace("_", " ")}
                </span>
                <span style={{ fontSize: 16, color: "oklch(0.6 0.02 250)" }}>›</span>
              </div>
            </Link>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ color: "oklch(0.5 0.02 250)", fontSize: 13 }}>Nenhuma OS neste filtro</div>
        )}
      </div>
    </MobileFrame>
  );
}
