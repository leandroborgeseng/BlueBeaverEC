"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Empty, Err, KpiCard, PageHeader, Panel } from "@/components/ui/nexo-ui";

interface Kpis {
  equipamentosAtivos: number;
  osAbertas: number;
  mttrMedioHoras: number | null;
  disponibilidadePct: number | null;
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [osSituacao, setOsSituacao] = useState<Array<{ situacao: string; total: number }>>([]);
  const [recentes, setRecentes] = useState<
    Array<{ codigo: string; status: string; equipamento: { tag: string; nome?: string } }>
  >([]);
  const [contratos, setContratos] = useState<
    Array<{ numero: string; alertaSeveridade: string | null; vigenciaFim: string; fornecedor: { nome: string } }>
  >([]);
  const [atrasadas, setAtrasadas] = useState<Array<{ codigo: string | null; prioridade: string; tag: string }>>(
    [],
  );
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<Kpis>("/dashboard/kpis"),
      api<Array<{ situacao: string; total: number }>>("/dashboard/os-por-situacao"),
      api<Array<{ codigo: string; status: string; equipamento: { tag: string; nome?: string } }>>(
        "/dashboard/os-recentes?limit=5",
      ),
      api<
        Array<{ numero: string; alertaSeveridade: string | null; vigenciaFim: string; fornecedor: { nome: string } }>
      >("/dashboard/contratos-vencendo?dias=30"),
      api<Array<{ codigo: string | null; prioridade: string; tag: string }>>("/dashboard/os-atrasadas"),
    ])
      .then(([k, s, r, c, a]) => {
        setKpis(k);
        setOsSituacao(s);
        setRecentes(r);
        setContratos(c);
        setAtrasadas(a);
      })
      .catch((e) => setErro(e.message));
  }, []);

  const maxBar = Math.max(1, ...osSituacao.map((x) => x.total));
  const hoje = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <PageHeader title="Visão geral" subtitle={hoje.charAt(0).toUpperCase() + hoje.slice(1)} />
      {erro && <Err>{erro}</Err>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <KpiCard label="Equipamentos ativos" value={kpis?.equipamentosAtivos ?? "—"} tone="info" />
        <KpiCard
          label="OS abertas"
          value={kpis?.osAbertas ?? "—"}
          hint={atrasadas.length > 0 ? `${atrasadas.length} atrasadas` : "sem atraso"}
          tone={atrasadas.length > 0 ? "danger" : "neutral"}
        />
        <KpiCard
          label="Disponibilidade média"
          value={kpis?.disponibilidadePct != null ? `${kpis.disponibilidadePct}%` : "—"}
          tone="success"
        />
        <KpiCard
          label="Contratos a vencer"
          value={contratos.length}
          hint="próximos 30 dias"
          tone={contratos.length > 0 ? "warning" : "neutral"}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14, marginTop: 14 }}>
        <Panel title="Ordens de Serviço por situação">
          {osSituacao.length === 0 ? (
            <Empty />
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 160, paddingTop: 8 }}>
              {osSituacao.map((row) => (
                <div key={row.situacao} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{row.total}</div>
                  <div
                    style={{
                      height: `${Math.max(8, (row.total / maxBar) * 110)}px`,
                      borderRadius: "6px 6px 2px 2px",
                      background: barColor(row.situacao),
                      margin: "0 auto",
                      maxWidth: 48,
                    }}
                  />
                  <div style={{ fontSize: 11, color: "oklch(0.5 0.02 250)", marginTop: 8, lineHeight: 1.2 }}>
                    {prettyStatus(row.situacao)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="OS atrasadas (SLA)">
          {atrasadas.length === 0 ? (
            <Empty text="Nenhuma OS atrasada." />
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {atrasadas.slice(0, 8).map((os) => (
                <li
                  key={`${os.codigo}-${os.tag}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: "1px solid oklch(0.94 0.005 255)",
                    fontSize: 13,
                  }}
                >
                  <span>
                    {os.codigo} · {os.tag}
                  </span>
                  <Badge tone={os.prioridade}>{os.prioridade}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <Panel
          title="Ordens de Serviço recentes"
          action={
            <Link href="/os" style={{ fontSize: 12.5, fontWeight: 600 }}>
              Ver todas →
            </Link>
          }
        >
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
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: "1px solid oklch(0.94 0.005 255)",
                    fontSize: 13,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {os.equipamento.nome ?? os.equipamento.tag}
                    </div>
                    <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                      {os.codigo} · {os.equipamento.tag}
                    </div>
                  </div>
                  <Badge tone={os.status}>{prettyStatus(os.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Contratos a vencer">
          {contratos.length === 0 ? (
            <Empty text="Nenhum contrato nos próximos 30 dias." />
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {contratos.map((c) => (
                <li
                  key={c.numero}
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid oklch(0.94 0.005 255)",
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {c.fornecedor.nome} — {c.numero}
                  </div>
                  <div style={{ fontSize: 12, color: "oklch(0.55 0.12 85)", fontWeight: 600, marginTop: 2 }}>
                    vence em {new Date(c.vigenciaFim).toLocaleDateString("pt-BR")}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function prettyStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function barColor(situacao: string) {
  const s = situacao.toUpperCase();
  if (s.includes("ATRAS")) return "oklch(0.55 0.18 25)";
  if (s.includes("ANDAMENTO")) return "oklch(0.75 0.14 85)";
  if (s.includes("PECA") || s.includes("PEÇA")) return "oklch(0.55 0.14 300)";
  if (s.includes("CONCLU")) return "oklch(0.55 0.14 150)";
  return "oklch(0.55 0.14 255)";
}
