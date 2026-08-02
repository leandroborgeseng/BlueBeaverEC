"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface OsCard {
  id: string;
  codigo: string;
  prioridade: string;
  atrasada: boolean;
  equipamento: { tag: string; nome: string };
}

type Quadro = Record<string, OsCard[]>;

const COLS = ["ABERTA", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"] as const;

export default function QuadroPage() {
  const [quadro, setQuadro] = useState<Quadro>({});

  useEffect(() => {
    api<Quadro>("/os/quadro-processos").then(setQuadro).catch(() => setQuadro({}));
  }, []);

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Quadro de Processos</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Kanban por status · drag-and-drop fora desta fase
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        {COLS.map((col) => (
          <section key={col} style={colStyle}>
            <h2 style={{ margin: "0 0 10px", fontSize: 13 }}>{col.replace("_", " ")}</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {(quadro[col] ?? []).map((os) => (
                <div key={os.id} style={card}>
                  <strong>{os.codigo}</strong>
                  <div style={{ fontSize: 12, color: "var(--nexo-muted)" }}>
                    {os.equipamento.tag} · {os.prioridade}
                  </div>
                  {os.atrasada && (
                    <div style={{ color: "var(--nexo-danger)", fontSize: 11, fontWeight: 700 }}>ATRASADA</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

const colStyle: React.CSSProperties = {
  background: "oklch(0.97 0.01 250)",
  borderRadius: 12,
  padding: 12,
  minHeight: 320,
};
const card: React.CSSProperties = {
  background: "white",
  border: "1px solid var(--nexo-border)",
  borderRadius: 10,
  padding: 10,
};
