"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWindowStore } from "@/store/windows";
import {
  Badge,
  Btn,
  Err,
  PageHeader,
  PriorityBar,
  Surface,
  fieldStyle,
} from "@/components/ui/aion-ui";

interface OsCard {
  id: string;
  numero: number;
  codigo: string;
  prioridade: string;
  atrasada: boolean;
  status?: string;
  equipamento: { tag: string; nome: string };
}

type Quadro = Record<string, OsCard[]>;
type ColKey = "ABERTA" | "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA";

const COLS: ColKey[] = ["ABERTA", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"];

const COL_LABELS: Record<ColKey, string> = {
  ABERTA: "Aberta",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

function acaoParaDestino(from: ColKey, to: ColKey): { acao: string; precisaJustificativa?: boolean } | null {
  if (from === to) return null;
  if (to === "EM_ANDAMENTO") return { acao: "iniciar" };
  if (to === "ABERTA" && from === "EM_ANDAMENTO") return { acao: "pausar" };
  if (to === "ABERTA" && (from === "CONCLUIDA" || from === "CANCELADA")) {
    return { acao: "reabrir", precisaJustificativa: true };
  }
  if (to === "CONCLUIDA") return { acao: "fechar" };
  if (to === "CANCELADA") return { acao: "cancelar", precisaJustificativa: true };
  return null;
}

export default function QuadroPage() {
  const open = useWindowStore((s) => s.open);
  const [quadro, setQuadro] = useState<Quadro>({});
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<Quadro>("/os/quadro-processos");
    setQuadro(data);
  }, []);

  useEffect(() => {
    void load().catch(() => setQuadro({}));
  }, [load]);

  async function mover(os: OsCard, from: ColKey, to: ColKey) {
    const map = acaoParaDestino(from, to);
    if (!map) return;
    let justificativa: string | undefined;
    if (map.precisaJustificativa) {
      justificativa = window.prompt("Justificativa:") ?? undefined;
      if (!justificativa?.trim()) return;
    }
    setBusy(os.codigo);
    setErro(null);
    try {
      await api(`/os/${os.numero}/status`, {
        method: "PATCH",
        body: JSON.stringify({ acao: map.acao, justificativa }),
      });
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao mover OS");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Quadro de Processos"
        subtitle="Mova a OS entre colunas pelo seletor · clique no código para abrir"
      />
      {erro && <Err>{erro}</Err>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        {COLS.map((col) => (
          <Surface key={col} style={{ background: "oklch(0.975 0.005 250)", minHeight: 320 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <strong style={{ fontSize: 13 }}>{COL_LABELS[col]}</strong>
              <Badge tone={col}>{(quadro[col] ?? []).length}</Badge>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {(quadro[col] ?? []).map((os) => (
                <Surface key={os.id} style={{ padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <PriorityBar prioridade={os.prioridade} />
                    <Btn
                      variant="ghost"
                      size="sm"
                      disabled={busy === os.codigo}
                      onClick={() =>
                        open({
                          kind: "os",
                          title: `${os.codigo} — ${os.equipamento.nome}`,
                          payload: { numero: os.numero, codigo: os.codigo },
                        })
                      }
                      style={{ fontWeight: 700, padding: "2px 6px" }}
                    >
                      {os.codigo}
                    </Btn>
                  </div>
                  <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 4, paddingLeft: 12 }}>
                    {os.equipamento.tag} · {os.prioridade}
                  </div>
                  {os.atrasada && (
                    <div style={{ marginTop: 6, paddingLeft: 12 }}>
                      <Badge tone="ATRASADA">ATRASADA</Badge>
                    </div>
                  )}
                  <div style={{ marginTop: 8, paddingLeft: 12 }}>
                    <select
                      value={col}
                      disabled={busy === os.codigo}
                      onChange={(e) => void mover(os, col, e.target.value as ColKey)}
                      style={{ ...fieldStyle, fontSize: 12, padding: "6px 8px" }}
                    >
                      {COLS.map((c) => (
                        <option key={c} value={c}>
                          → {COL_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                </Surface>
              ))}
            </div>
          </Surface>
        ))}
      </div>
    </div>
  );
}
