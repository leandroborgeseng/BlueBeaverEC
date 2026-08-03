"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWindowStore } from "@/store/windows";
import { OsFilasNav } from "@/components/os/OsFilasNav";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
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

type Quadro = Record<string, OsCard[]> & {
  meta?: {
    pageSize: number;
    truncated: Record<string, boolean>;
    totals: Record<string, number>;
  };
};
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
  const [pending, setPending] = useState<{
    os: OsCard;
    from: ColKey;
    to: ColKey;
    acao: string;
  } | null>(null);

  const load = useCallback(async () => {
    const data = await api<Quadro>("/os/quadro-processos");
    setQuadro(data);
  }, []);

  useEffect(() => {
    void load().catch(() => setQuadro({}));
  }, [load]);

  async function executarMove(os: OsCard, acao: string, justificativa?: string) {
    setBusy(os.codigo);
    setErro(null);
    try {
      await api(`/os/${os.numero}/status`, {
        method: "PATCH",
        body: JSON.stringify({ acao, justificativa }),
      });
      await load();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao mover OS");
    } finally {
      setBusy(null);
    }
  }

  async function mover(os: OsCard, from: ColKey, to: ColKey) {
    const map = acaoParaDestino(from, to);
    if (!map) return;
    if (map.precisaJustificativa) {
      setPending({ os, from, to, acao: map.acao });
      return;
    }
    await executarMove(os, map.acao);
  }

  const truncado = COLS.some((c) => quadro.meta?.truncated?.[c]);

  return (
    <div>
      <PageHeader
        title="Quadro de Processos"
        subtitle="Fila · mova a OS entre colunas pelo seletor · clique no código para abrir"
      />
      <OsFilasNav />
      {erro && <Err>{erro}</Err>}
      {truncado && (
        <Err>
          Exibindo até {quadro.meta?.pageSize ?? 100} OS por coluna — há mais itens (veja totais no cabeçalho).
        </Err>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        {COLS.map((col) => (
          <Surface key={col} style={{ background: "oklch(0.975 0.005 250)", minHeight: 320 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <strong style={{ fontSize: 13 }}>{COL_LABELS[col]}</strong>
              <Badge tone={col}>
                {(quadro[col] ?? []).length}
                {quadro.meta?.totals?.[col] != null && quadro.meta.totals[col] > (quadro[col] ?? []).length
                  ? ` / ${quadro.meta.totals[col]}`
                  : ""}
              </Badge>
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

      <ConfirmModal
        open={Boolean(pending)}
        title={pending ? `${pending.acao === "cancelar" ? "Cancelar" : "Reabrir"} ${pending.os.codigo}` : ""}
        message="Informe a justificativa para continuar."
        requireJustification
        danger={pending?.acao === "cancelar"}
        confirmLabel="Confirmar"
        onCancel={() => setPending(null)}
        onConfirm={async (justificativa) => {
          if (!pending) return;
          const { os, acao } = pending;
          setPending(null);
          await executarMove(os, acao, justificativa);
        }}
      />
    </div>
  );
}
