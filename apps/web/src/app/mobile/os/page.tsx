"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";

interface OsRow {
  id: string;
  numero: number;
  codigo: string;
  prioridade: string;
  atrasada: boolean;
  equipamento: { tag: string; nome: string; setor: { nome: string } };
}

export default function MobileOsPage() {
  const [items, setItems] = useState<OsRow[]>([]);
  const { pending, online, flush } = useOfflineQueue();

  useEffect(() => {
    api<OsRow[]>("/mobile/minhas-os").then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <MobileFrame title="Minhas OS" online={online} pending={pending} onSync={() => void flush()}>
      <div style={{ display: "grid", gap: 10 }}>
        {items.map((os) => (
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
        {items.length === 0 && <div style={{ color: "var(--nexo-muted)" }}>Nenhuma OS atribuída</div>}
      </div>
    </MobileFrame>
  );
}
