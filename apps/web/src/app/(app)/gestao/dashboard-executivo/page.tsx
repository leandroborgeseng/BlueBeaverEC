"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Dash {
  indiceMaturidadePct: number | null;
  nivelMaturidade: number | null;
  indiceConformidadePct: number | null;
  disponibilidadePct: number | null;
  riscosCriticos: { total: number; ncAbertas: number; osUrgentes: number; anvisaVencida: number };
  evolucaoPorDominio: Array<{ codigo: string; nome: string; nivel: number | null }>;
  contratosVencendo: Array<{ numero: string; fornecedor: { nome: string }; vigenciaFim: string }>;
  recomendacoes: Array<{ id: string; titulo: string; prioridade: string; origem: string }>;
  prioridadesMes: Array<{ codigo: string | null; numero: number; equipamento: { tag: string } }>;
}

export default function DashboardExecutivoPage() {
  const [d, setD] = useState<Dash | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<Dash>("/estrategico/dashboard-executivo")
      .then(setD)
      .catch((e) => setErro(e.message));
  }, []);

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Dashboard Executivo</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Índice de maturidade calculado automaticamente a partir dos domínios avaliados
      </p>
      {erro && <div style={{ color: "var(--nexo-danger)" }}>{erro}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Kpi label="Maturidade" value={d?.indiceMaturidadePct != null ? `${d.indiceMaturidadePct}%` : "—"} sub={d?.nivelMaturidade != null ? `Nível ${d.nivelMaturidade}` : undefined} />
        <Kpi label="Conformidade" value={d?.indiceConformidadePct != null ? `${d.indiceConformidadePct}%` : "—"} />
        <Kpi label="Disponibilidade" value={d?.disponibilidadePct != null ? `${d.disponibilidadePct}%` : "—"} />
        <Kpi label="Riscos críticos" value={d?.riscosCriticos.total ?? "—"} sub={d ? `NC ${d.riscosCriticos.ncAbertas} · Urg ${d.riscosCriticos.osUrgentes}` : undefined} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14, marginTop: 16 }}>
        <Panel title="Evolução por domínio">
          {(d?.evolucaoPorDominio ?? []).map((x) => (
            <Row key={x.codigo} left={x.nome} right={x.nivel != null ? `Nível ${x.nivel}` : "Não avaliado"} />
          ))}
        </Panel>
        <Panel title="Recomendações institucionais">
          {(d?.recomendacoes ?? []).length === 0 && <Empty />}
          {(d?.recomendacoes ?? []).map((r) => (
            <div key={r.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--nexo-border)", fontSize: 13 }}>
              <strong>{r.prioridade}</strong> · {r.titulo}
              <div style={{ color: "var(--nexo-muted)", fontSize: 12 }}>{r.origem}</div>
            </div>
          ))}
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <Panel title="Prioridades do mês">
          {(d?.prioridadesMes ?? []).length === 0 && <Empty />}
          {(d?.prioridadesMes ?? []).map((p) => (
            <Row key={p.numero} left={`OS-${p.numero} · ${p.equipamento.tag}`} right={p.codigo ?? ""} />
          ))}
        </Panel>
        <Panel title="Contratos a vencer">
          {(d?.contratosVencendo ?? []).length === 0 && <Empty />}
          {(d?.contratosVencendo ?? []).map((c) => (
            <Row key={c.numero} left={`${c.numero} · ${c.fornecedor.nome}`} right={c.vigenciaFim.slice(0, 10)} />
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: "var(--nexo-surface)", border: "1px solid var(--nexo-border)", borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 11, color: "var(--nexo-muted)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--nexo-muted)" }}>{sub}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ background: "var(--nexo-surface)", border: "1px solid var(--nexo-border)", borderRadius: 12, padding: 14 }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 14 }}>{title}</h2>
      {children}
    </section>
  );
}

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--nexo-border)", fontSize: 13 }}>
      <span>{left}</span>
      <strong>{right}</strong>
    </div>
  );
}

function Empty() {
  return <div style={{ fontSize: 13, color: "var(--nexo-muted)" }}>Nenhum item</div>;
}
