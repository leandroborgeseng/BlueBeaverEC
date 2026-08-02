"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface OsRow {
  id: string;
  codigo: string;
  prioridade: string;
  atrasada: boolean;
  equipamento: { tag: string; nome: string };
}

export default function NaoAtribuidasPage() {
  const [items, setItems] = useState<OsRow[]>([]);

  useEffect(() => {
    api<OsRow[]>("/os/nao-atribuidas").then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Fila Não Atribuídas</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Ordenada por prioridade e data de abertura
      </p>
      <div style={{ display: "grid", gap: 10 }}>
        {items.map((os) => (
          <div
            key={os.id}
            style={{
              background: "var(--nexo-surface)",
              border: "1px solid var(--nexo-border)",
              borderRadius: 12,
              padding: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <strong>{os.codigo}</strong>
              <div style={{ fontSize: 13, color: "var(--nexo-muted)" }}>
                {os.equipamento.tag} — {os.equipamento.nome}
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 12 }}>
              <div style={{ fontWeight: 700 }}>{os.prioridade}</div>
              {os.atrasada && <div style={{ color: "var(--nexo-danger)", fontWeight: 700 }}>ATRASADA</div>}
            </div>
          </div>
        ))}
        {items.length === 0 && <div style={{ color: "var(--nexo-muted)" }}>Fila vazia</div>}
      </div>
    </div>
  );
}
