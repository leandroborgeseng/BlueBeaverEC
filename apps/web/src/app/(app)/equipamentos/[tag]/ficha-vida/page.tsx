"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import {
  Empty,
  Err,
  KpiCard,
  PageHeader,
  Panel,
} from "@/components/ui/aion-ui";

interface Ficha {
  equipamento: { tag: string; nome: string; criticidade: string; vidaUtilAnos: number };
  confiabilidade: { mtbf: number | string; mttf: number | string };
  depreciacao: { valorAquisicao: number | null; valorDepreciado: number | null };
  custos: { totalOS: number; totalContrato: number; nOS: number };
  historico: Array<{ tipo: string; ref: string | null; data: string; detalhe: string }>;
}

export default function FichaVidaPage() {
  const params = useParams<{ tag: string }>();
  const tag = decodeURIComponent(params.tag);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<Ficha>(`/equipamentos/${encodeURIComponent(tag)}/ficha-vida`)
      .then(setFicha)
      .catch((e) => setErro(e.message));
  }, [tag]);

  if (erro) return <Err>{erro}</Err>;
  if (!ficha) return <div style={{ color: "oklch(0.5 0.02 250)" }}>Carregando…</div>;

  return (
    <div>
      <PageHeader
        title={`Ficha Vida · ${ficha.equipamento.tag}`}
        subtitle={`${ficha.equipamento.nome} · criticidade ${ficha.equipamento.criticidade} · vida útil ${ficha.equipamento.vidaUtilAnos} anos`}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <KpiCard label="MTBF (dias)" value={ficha.confiabilidade.mtbf} tone="info" />
        <KpiCard label="MTTF (dias)" value={ficha.confiabilidade.mttf} tone="neutral" />
        <KpiCard
          label="Valor depreciado"
          value={
            ficha.depreciacao.valorDepreciado == null
              ? "—"
              : ficha.depreciacao.valorDepreciado.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })
          }
          tone="warning"
        />
        <KpiCard
          label="Custo OS"
          value={ficha.custos.totalOS.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          hint={`${ficha.custos.nOS} ordens`}
          tone="success"
        />
      </div>

      <Panel title="Histórico unificado">
        {ficha.historico.length === 0 ? (
          <Empty text="Sem histórico" />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {ficha.historico.map((h, i) => (
              <li
                key={`${h.tipo}-${h.ref}-${i}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid oklch(0.94 0.005 255)",
                  fontSize: 13,
                }}
              >
                <span>
                  <strong>{h.tipo}</strong> {h.ref} · {h.detalhe}
                </span>
                <span style={{ color: "oklch(0.5 0.02 250)" }}>
                  {new Date(h.data).toLocaleDateString("pt-BR")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
