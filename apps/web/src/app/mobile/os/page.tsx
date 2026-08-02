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
      <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
        {(["TODAS", "ABERTAS", "URGENTES"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            style={{
              flex: 1,
              padding: 8,
              borderRadius: 8,
              border: filtro === f ? "2px solid var(--nexo-primary)" : "1px solid var(--nexo-border)",
              background: filtro === f ? "oklch(0.95 0.03 250)" : "white",
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            {f}
            {f === "URGENTES" && urgentes > 0 ? ` (${urgentes})` : ""}
          </button>
        ))}
      </div>
      {urgentes > 0 && (
        <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 800, color: "var(--nexo-danger)" }}>
          {urgentes} urgente(s)
        </div>
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((os) => (
          <Link
            key={os.id}
            href={`/mobile/os/${os.numero}`}
            style={{
              background: "white",
              border: "1px solid var(--nexo-border)",
              borderLeft: `4px solid ${os.prioridade === "URGENTE" ? "var(--nexo-danger)" : "var(--nexo-primary)"}`,
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 800 }}>{os.codigo}</div>
            <div style={{ fontSize: 13, color: "var(--nexo-muted)" }}>
              {os.equipamento.tag} · {os.equipamento.setor.nome}
            </div>
            {os.atrasada && (
              <div style={{ marginTop: 6, color: "var(--nexo-danger)", fontSize: 11, fontWeight: 700 }}>
                ATRASADA
              </div>
            )}
          </Link>
        ))}
        {filtered.length === 0 && <div style={{ color: "var(--nexo-muted)" }}>Nenhuma OS neste filtro</div>}
      </div>
    </MobileFrame>
  );
}
