"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LABEL_STATUS_ATENDIMENTO, type StatusAtendimentoExterno } from "@aion/shared";
import { Badge, Empty, Err, Loading, PageHeader, Panel } from "@/components/ui/aion-ui";
import { useWindowStore } from "@/store/windows";

interface Pend {
  id: string;
  status: StatusAtendimentoExterno;
  foraDoHospital: boolean;
  pendenciaRetorno: boolean;
  previsaoRetorno?: string | null;
  fornecedor: { nome: string };
  equipamento: { tag: string; nome: string; condicaoUso?: string };
  ordemServico: { numero: number; codigo?: string | null };
  custos: { informado: number | null; aprovado: number | null; realizado: number | null };
}

export default function AtendimentosExternosPage() {
  const open = useWindowStore((s) => s.open);
  const [items, setItems] = useState<Pend[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Pend[]>("/atendimentos-externos")
      .then(setItems)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Assistência externa"
        subtitle="Equipamentos fora do hospital e pendência de retorno — conferência antes de liberar o uso"
      />
      {erro && <Err>{erro}</Err>}
      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text="Nenhuma pendência de assistência externa." />
      ) : (
        <Panel title="Pendências">
          {items.map((a) => (
            <div
              key={a.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1fr 1fr auto",
                gap: 10,
                padding: "10px 0",
                borderBottom: "1px solid oklch(0.94 0.005 255)",
                fontSize: 13,
              }}
            >
              <div>
                <Link href={`/equipamentos/${encodeURIComponent(a.equipamento.tag)}`}>
                  <strong>{a.equipamento.tag}</strong>
                </Link>{" "}
                · {a.equipamento.nome}
                <div style={{ color: "oklch(0.5 0.02 250)" }}>{a.fornecedor.nome}</div>
              </div>
              <div>
                <Badge tone={a.status}>{LABEL_STATUS_ATENDIMENTO[a.status] ?? a.status}</Badge>
                {a.foraDoHospital && <div>Fora do hospital</div>}
                {a.pendenciaRetorno && <div>Pendência de retorno</div>}
              </div>
              <div>
                Previsão{" "}
                {a.previsaoRetorno ? new Date(a.previsaoRetorno).toLocaleDateString("pt-BR") : "—"}
                <div>Condição {a.equipamento.condicaoUso ?? "—"}</div>
              </div>
              <button
                type="button"
                onClick={() =>
                  open({
                    kind: "os",
                    title: `OS ${a.ordemServico.codigo ?? a.ordemServico.numero}`,
                    payload: { numero: a.ordemServico.numero, codigo: a.ordemServico.codigo },
                  })
                }
                style={{ background: "none", border: "none", color: "oklch(0.4 0.12 250)", cursor: "pointer" }}
              >
                OS {a.ordemServico.codigo ?? a.ordemServico.numero}
              </button>
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}
