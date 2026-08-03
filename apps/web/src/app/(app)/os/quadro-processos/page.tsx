"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
  PageHeader,
  PriorityBar,
  Surface,
} from "@/components/ui/aion-ui";

interface OsCard {
  id: string;
  codigo: string;
  prioridade: string;
  atrasada: boolean;
  equipamento: { tag: string; nome: string };
}

type Quadro = Record<string, OsCard[]>;

const COLS = ["ABERTA", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"] as const;

const COL_LABELS: Record<string, string> = {
  ABERTA: "Aberta",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export default function QuadroPage() {
  const [quadro, setQuadro] = useState<Quadro>({});

  useEffect(() => {
    api<Quadro>("/os/quadro-processos").then(setQuadro).catch(() => setQuadro({}));
  }, []);

  return (
    <div>
      <PageHeader title="Quadro de Processos" subtitle="Kanban por status (visualização; arraste será adicionado depois)" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        {COLS.map((col) => (
          <Surface key={col} style={{ background: "oklch(0.975 0.005 250)", minHeight: 320 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <strong style={{ fontSize: 13 }}>{COL_LABELS[col] ?? col}</strong>
              <Badge tone={col}>{(quadro[col] ?? []).length}</Badge>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {(quadro[col] ?? []).map((os) => (
                <Surface key={os.id} style={{ padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <PriorityBar prioridade={os.prioridade} />
                    <strong style={{ fontSize: 13 }}>{os.codigo}</strong>
                  </div>
                  <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 4, paddingLeft: 12 }}>
                    {os.equipamento.tag} · {os.prioridade}
                  </div>
                  {os.atrasada && (
                    <div style={{ marginTop: 6, paddingLeft: 12 }}>
                      <Badge tone="ATRASADA">ATRASADA</Badge>
                    </div>
                  )}
                </Surface>
              ))}
            </div>
          </Surface>
        ))}
      </div>
    </div>
  );
}
