"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

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

  if (erro) return <div style={{ color: "var(--nexo-danger)" }}>{erro}</div>;
  if (!ficha) return <div style={{ color: "var(--nexo-muted)" }}>Carregando…</div>;

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>
        Ficha Vida · {ficha.equipamento.tag}
      </h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        {ficha.equipamento.nome} · criticidade {ficha.equipamento.criticidade} · vida útil{" "}
        {ficha.equipamento.vidaUtilAnos} anos
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <Kpi label="MTBF (dias)" value={ficha.confiabilidade.mtbf} />
        <Kpi label="MTTF (dias)" value={ficha.confiabilidade.mttf} />
        <Kpi
          label="Valor depreciado"
          value={
            ficha.depreciacao.valorDepreciado == null
              ? "—"
              : ficha.depreciacao.valorDepreciado.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })
          }
        />
        <Kpi
          label="Custo OS"
          value={ficha.custos.totalOS.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        />
      </div>

      <section style={card}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Histórico unificado</h2>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {ficha.historico.map((h, i) => (
            <li
              key={`${h.tipo}-${h.ref}-${i}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 0",
                borderBottom: "1px solid var(--nexo-border)",
                fontSize: 13,
              }}
            >
              <span>
                <strong>{h.tipo}</strong> {h.ref} · {h.detalhe}
              </span>
              <span style={{ color: "var(--nexo-muted)" }}>
                {new Date(h.data).toLocaleDateString("pt-BR")}
              </span>
            </li>
          ))}
          {ficha.historico.length === 0 && (
            <li style={{ color: "var(--nexo-muted)" }}>Sem histórico</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: "var(--nexo-muted)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--nexo-surface)",
  border: "1px solid var(--nexo-border)",
  borderRadius: 12,
  padding: 14,
};
