"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { SlaChip } from "@/components/os/SlaChip";
import { Badge, Empty, Err, KpiCard, PageHeader, Panel } from "@/components/ui/aion-ui";

interface Kpis {
  equipamentosAtivos: number;
  osAbertas: number;
  osSemResponsavel?: number;
  equipamentosParados?: number;
  osSlaEstourado?: number;
  duracaoMediaOsHoras?: number | null;
  mttrMedioHoras: number | null;
  mttrStatus?: string;
  mttrMotivo?: string | null;
  parqueEmOperacaoPct?: number | null;
  disponibilidadePct: number | null;
  atualizadoEm?: string;
}

interface OsSlaRow {
  numero: number;
  codigo: string;
  status: string;
  prioridade: string;
  tag: string;
  nome?: string;
  slaLimite?: string;
  slaEstourado?: boolean;
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [osSituacao, setOsSituacao] = useState<Array<{ situacao: string; total: number }>>([]);
  const [equipStatus, setEquipStatus] = useState<Array<{ situacao: string; total: number }>>([]);
  const [recentes, setRecentes] = useState<
    Array<{
      codigo: string;
      status: string;
      slaLimite?: string;
      equipamento: { tag: string; nome?: string };
    }>
  >([]);
  const [contratos, setContratos] = useState<
    Array<{ numero: string; alertaSeveridade: string | null; vigenciaFim: string; fornecedor: { nome: string } }>
  >([]);
  const [atrasadas, setAtrasadas] = useState<OsSlaRow[]>([]);
  const [slaAbertas, setSlaAbertas] = useState<OsSlaRow[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<Kpis>("/dashboard/kpis"),
      api<Array<{ situacao: string; total: number }>>("/dashboard/os-por-situacao"),
      api<Array<{ situacao: string; total: number }>>("/dashboard/equipamentos-status"),
      api<
        Array<{
          codigo: string;
          status: string;
          slaLimite?: string;
          equipamento: { tag: string; nome?: string };
        }>
      >("/dashboard/os-recentes?limit=5"),
      api<
        Array<{ numero: string; alertaSeveridade: string | null; vigenciaFim: string; fornecedor: { nome: string } }>
      >("/dashboard/contratos-vencendo?dias=30"),
      api<OsSlaRow[]>("/dashboard/os-atrasadas"),
      api<OsSlaRow[]>("/dashboard/os-sla"),
    ])
      .then(([k, s, es, r, c, a, sla]) => {
        setKpis(k);
        setOsSituacao(s);
        setEquipStatus(es);
        setRecentes(r);
        setContratos(c);
        setAtrasadas(a);
        setSlaAbertas(sla);
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
      <PageHeader
        title="Visão geral"
        subtitle={
          <>
            {hoje.charAt(0).toUpperCase() + hoje.slice(1)}
            {kpis?.atualizadoEm ? ` · atualizado ${new Date(kpis.atualizadoEm).toLocaleString("pt-BR")}` : ""}
            {" · "}
            <Link href="/gestao/indicadores">Indicadores do gestor</Link>
          </>
        }
      />
      {erro && <Err>{erro}</Err>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 22 }}>
        <KpiCard
          label="Equipamentos ativos"
          value={kpis?.equipamentosAtivos ?? "—"}
          hint={
            kpis?.parqueEmOperacaoPct != null
              ? `${kpis.parqueEmOperacaoPct}% do parque (snapshot, não é uptime)`
              : "parque vazio — não é 100%"
          }
          tone="info"
        />
        <KpiCard
          label="OS abertas"
          value={kpis?.osAbertas ?? "—"}
          hint={
            (kpis?.osSlaEstourado ?? atrasadas.length) > 0
              ? `${kpis?.osSlaEstourado ?? atrasadas.length} com SLA estourado · ${kpis?.osSemResponsavel ?? 0} sem responsável`
              : `${kpis?.osSemResponsavel ?? 0} sem responsável`
          }
          tone={(kpis?.osSlaEstourado ?? atrasadas.length) > 0 ? "danger" : "neutral"}
        />
        <KpiCard
          label="MTTR"
          value={
            kpis?.mttrStatus === "medido" && kpis.mttrMedioHoras != null
              ? `${kpis.mttrMedioHoras.toFixed(1)} h`
              : "dados insuficientes"
          }
          hint={
            kpis?.mttrStatus === "medido"
              ? "paradas registradas encerradas"
              : kpis?.mttrMotivo ?? "duração da OS não é MTTR"
          }
          tone="info"
        />
        <KpiCard
          label="Equipamentos parados"
          value={kpis?.equipamentosParados ?? "—"}
          hint={
            kpis?.duracaoMediaOsHoras != null
              ? `duração média das OS concluídas: ${kpis.duracaoMediaOsHoras.toFixed(1)} h (não é MTTR)`
              : "condição de uso PARADO"
          }
          tone={(kpis?.equipamentosParados ?? 0) > 0 ? "danger" : "neutral"}
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
        <Panel title="SLA das OS abertas">
          {slaAbertas.length === 0 ? (
            <Empty text="Nenhuma OS aberta." />
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {slaAbertas.slice(0, 8).map((os) => (
                <li
                  key={`${os.codigo}-${os.tag}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    padding: "11px 0",
                    borderBottom: "1px solid oklch(0.945 0.004 255)",
                    fontSize: 13,
                  }}
                >
                  <span>
                    <div style={{ fontWeight: 600 }}>{os.codigo} · {os.tag}</div>
                    <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>{os.nome ?? ""}</div>
                  </span>
                  <SlaChip slaLimite={os.slaLimite} slaEstourado={os.slaEstourado} status={os.status} />
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
                    <div style={{ fontWeight: 600 }}>{os.equipamento?.nome ?? os.equipamento?.tag ?? "Chamado do setor"}</div>
                    <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                      {os.codigo} · {os.equipamento?.tag ?? "—"}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <Badge tone={os.status}>{prettyStatus(os.status)}</Badge>
                    <SlaChip slaLimite={os.slaLimite} status={os.status} />
                  </div>
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
