"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Kpis {
  equipamentosAtivos: number;
  osAbertas: number;
  mttrMedioHoras: number | null;
  disponibilidadePct: number | null;
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [osSituacao, setOsSituacao] = useState<Array<{ situacao: string; total: number }>>([]);
  const [recentes, setRecentes] = useState<Array<{ codigo: string; status: string; equipamento: { tag: string } }>>([]);
  const [contratos, setContratos] = useState<Array<{ numero: string; alertaSeveridade: string | null; vigenciaFim: string; fornecedor: { nome: string } }>>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<Kpis>("/dashboard/kpis"),
      api<Array<{ situacao: string; total: number }>>("/dashboard/os-por-situacao"),
      api<Array<{ codigo: string; status: string; equipamento: { tag: string } }>>("/dashboard/os-recentes?limit=5"),
      api<Array<{ numero: string; alertaSeveridade: string | null; vigenciaFim: string; fornecedor: { nome: string } }>>("/dashboard/contratos-vencendo?dias=30"),
    ])
      .then(([k, s, r, c]) => {
        setKpis(k);
        setOsSituacao(s);
        setRecentes(r);
        setContratos(c);
      })
      .catch((e) => setErro(e.message));
  }, []);

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Dashboard</h1>
      <p style={{ margin: "0 0 20px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Visão operacional diária da Engenharia Clínica
      </p>

      {erro && <div style={{ color: "var(--nexo-danger)" }}>{erro}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <Kpi label="Equipamentos ativos" value={kpis?.equipamentosAtivos ?? "—"} />
        <Kpi label="OS abertas" value={kpis?.osAbertas ?? "—"} />
        <Kpi label="MTTR médio (h)" value={kpis?.mttrMedioHoras ?? "—"} />
        <Kpi label="Disponibilidade" value={kpis?.disponibilidadePct ? `${kpis.disponibilidadePct}%` : "—"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, marginTop: 18 }}>
        <Panel title="OS por situação">
          {osSituacao.length === 0 ? (
            <Empty />
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {osSituacao.map((row) => (
                <li
                  key={row.situacao}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--nexo-border)",
                    fontSize: 13,
                  }}
                >
                  <span>{row.situacao}</span>
                  <strong>{row.total}</strong>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="OS recentes">
          {recentes.length === 0 ? (
            <Empty />
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {recentes.map((os) => (
                <li
                  key={os.codigo}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--nexo-border)",
                    fontSize: 13,
                  }}
                >
                  <span>
                    {os.codigo} · {os.equipamento.tag}
                  </span>
                  <span style={{ color: "var(--nexo-muted)" }}>{os.status}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div style={{ marginTop: 16 }}>
        <Panel title="Contratos a vencer (≤30 dias)">
          {contratos.length === 0 ? (
            <Empty />
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {contratos.map((c) => (
                <li
                  key={c.numero}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom: "1px solid var(--nexo-border)",
                    fontSize: 13,
                  }}
                >
                  <span>
                    {c.numero} · {c.fornecedor.nome}
                  </span>
                  <span style={{ color: "var(--nexo-warning)", fontWeight: 700 }}>
                    {new Date(c.vigenciaFim).toLocaleDateString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        background: "var(--nexo-surface)",
        border: "1px solid var(--nexo-border)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--nexo-muted)", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "var(--nexo-surface)",
        border: "1px solid var(--nexo-border)",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>{title}</h2>
      {children}
    </section>
  );
}

function Empty() {
  return <div style={{ color: "var(--nexo-muted)", fontSize: 13 }}>Sem dados</div>;
}
