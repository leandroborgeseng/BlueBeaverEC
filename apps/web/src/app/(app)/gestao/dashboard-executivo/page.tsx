"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Badge,
  Empty,
  Err,
  KpiCard,
  PageHeader,
  Panel,
} from "@/components/ui/aion-ui";

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
      <PageHeader title="Dashboard Executivo" subtitle="Índice de maturidade calculado automaticamente a partir dos domínios avaliados" />
      {erro && <Err>{erro}</Err>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KpiCard
          label="Maturidade"
          value={d?.indiceMaturidadePct != null ? `${d.indiceMaturidadePct}%` : "—"}
          hint={d?.nivelMaturidade != null ? `Nível ${d.nivelMaturidade}` : undefined}
          tone="info"
        />
        <KpiCard
          label="Conformidade"
          value={d?.indiceConformidadePct != null ? `${d.indiceConformidadePct}%` : "—"}
          tone="success"
        />
        <KpiCard
          label="Disponibilidade"
          value={d?.disponibilidadePct != null ? `${d.disponibilidadePct}%` : "—"}
          tone="neutral"
        />
        <KpiCard
          label="Riscos críticos"
          value={d?.riscosCriticos.total ?? "—"}
          hint={d ? `NC ${d.riscosCriticos.ncAbertas} · Urg ${d.riscosCriticos.osUrgentes}` : undefined}
          tone="danger"
        />
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
            <div key={r.id} style={{ padding: "8px 0", borderBottom: "1px solid oklch(0.94 0.005 255)", fontSize: 13 }}>
              <Badge tone={r.prioridade}>{r.prioridade}</Badge> · {r.titulo}
              <div style={{ color: "oklch(0.5 0.02 250)", fontSize: 12, marginTop: 4 }}>{r.origem}</div>
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

function Row({ left, right }: { left: string; right: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid oklch(0.94 0.005 255)", fontSize: 13 }}>
      <span>{left}</span>
      <strong>{right}</strong>
    </div>
  );
}
