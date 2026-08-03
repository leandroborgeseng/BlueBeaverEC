"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, Empty, Err, KpiCard, PageHeader, Panel } from "@/components/ui/aion-ui";

interface Kpis {
  equipamentosAtivos: number;
  osAbertas: number;
  mttrMedioHoras: number | null;
  disponibilidadePct: number | null;
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [osSituacao, setOsSituacao] = useState<Array<{ situacao: string; total: number }>>([]);
  const [equipStatus, setEquipStatus] = useState<Array<{ situacao: string; total: number }>>([]);
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
      api<Array<{ situacao: string; total: number }>>("/dashboard/equipamentos-status"),
      api<Array<{ codigo: string; status: string; equipamento: { tag: string; nome?: string } }>>(
        "/dashboard/os-recentes?limit=5",
      ),
      api<
        Array<{ numero: string; alertaSeveridade: string | null; vigenciaFim: string; fornecedor: { nome: string } }>
      >("/dashboard/contratos-vencendo?dias=30"),
      api<Array<{ codigo: string | null; prioridade: string; tag: string }>>("/dashboard/os-atrasadas"),
    ])
      .then(([k, s, es, r, c, a]) => {
        setKpis(k);
        setOsSituacao(s);
        setEquipStatus(es);
        setRecentes(r);
        setContratos(c);
        setAtrasadas(a);
      })
      .catch((e) => setErro(e.message));
  }, []);

  const maxBar = Math.max(1, ...osSituacao.map((x) => x.total));
  const maxEquip = Math.max(1, ...equipStatus.map((x) => x.total));
  const totalEquip = equipStatus.reduce((s, x) => s + x.total, 0);
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 22 }}>
        <KpiCard label="Equipamentos ativos" value={kpis?.equipamentosAtivos ?? "—"} tone="info" ringPct={78} />
        <KpiCard
          label="OS abertas"
          value={kpis?.osAbertas ?? "—"}
          hint={atrasadas.length > 0 ? `${atrasadas.length} atrasadas` : "sem atraso"}
          tone={atrasadas.length > 0 ? "danger" : "neutral"}
          ringPct={atrasadas.length > 0 ? 55 : 40}
        />
        <KpiCard
          label="MTTR médio"
          value={kpis?.mttrMedioHoras != null ? `${kpis.mttrMedioHoras.toFixed(1)} h` : "—"}
          hint="tempo médio de reparo"
          tone="info"
          ringPct={kpis?.mttrMedioHoras != null ? Math.min(100, kpis.mttrMedioHoras * 5) : 40}
        />
        <KpiCard
          label="Contratos a vencer"
          value={contratos.length}
          hint="próximos 30 dias"
          tone={contratos.length > 0 ? "warning" : "neutral"}
          ringPct={contratos.length > 0 ? 45 : 20}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Panel title="Equipamentos por situação">
          {equipStatus.length === 0 ? (
            <Empty />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {equipStatus.map((row) => (
                <div key={row.situacao} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 100, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                    {prettyStatus(row.situacao)}
                  </div>
                  <div style={{ flex: 1, height: 22, background: "oklch(0.94 0.003 255)", borderRadius: 5, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${(row.total / maxEquip) * 100}%`,
                        height: "100%",
                        background: equipBarColor(row.situacao),
                        borderRadius: 5,
                        minWidth: row.total > 0 ? 4 : 0,
                      }}
                    />
                  </div>
                  <div style={{ width: 36, textAlign: "right", fontSize: 13, fontWeight: 700 }}>{row.total}</div>
                </div>
              ))}
              <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                Total: {totalEquip} equipamento(s)
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, marginBottom: 16 }}>
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
                      borderRadius: "5px 5px 0 0",
                      background: barColor(row.situacao),
                      margin: "0 auto",
                      maxWidth: 48,
                    }}
                  />
                  <div style={{ fontSize: 10.5, color: "oklch(0.5 0.02 250)", marginTop: 8, lineHeight: 1.2 }}>
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
                    padding: "11px 0",
                    borderBottom: "1px solid oklch(0.945 0.004 255)",
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
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
                    <div style={{ fontWeight: 600 }}>{os.equipamento.nome ?? os.equipamento.tag}</div>
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

function equipBarColor(situacao: string) {
  const s = situacao.toUpperCase();
  if (s.includes("ATIVO")) return "oklch(0.55 0.14 150)";
  if (s.includes("GARANTIA")) return "oklch(0.55 0.14 255)";
  if (s.includes("INATIVO")) return "oklch(0.65 0.01 250)";
  if (s.includes("ARQUIV")) return "oklch(0.55 0.18 25)";
  return "oklch(0.55 0.14 255)";
}
