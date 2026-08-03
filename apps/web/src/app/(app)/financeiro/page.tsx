"use client";

import { useEffect, useState } from "react";
import { api, downloadApi } from "@/lib/api";
import {
  Badge,
  Btn,
  DataTable,
  Empty,
  Err,
  KpiCard,
  PageHeader,
  Panel,
  td,
  th,
} from "@/components/ui/aion-ui";

type Agrupar = "equipamento" | "setor" | "centroCusto";

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function FinanceiroPage() {
  const [dash, setDash] = useState<{
    totalGeral: number;
    porTipo: Record<string, number>;
    breakdown: Array<{ chave: string; total: number }>;
  } | null>(null);
  const [extrato, setExtrato] = useState<
    Array<{ tipo: string; data: string; descricao: string; valor: number; origem: string }>
  >([]);
  const [agrupar, setAgrupar] = useState<Agrupar>("equipamento");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<typeof dash>(`/financeiro/dashboard?agrupar=${agrupar}`),
      api<typeof extrato>("/financeiro/extrato"),
    ])
      .then(([d, e]) => {
        setDash(d);
        setExtrato(e);
      })
      .catch((e) => setErro(e.message));
  }, [agrupar]);

  return (
    <div>
      <PageHeader
        title="Financeiro"
        subtitle="Agregação de custos derivados (OS, rateio, glosas) — sem lançamento manual"
        actions={
          <>
            <Btn
              variant="ghost"
              onClick={() =>
                void downloadApi("/financeiro/export", { method: "GET" }, "extrato-financeiro.csv").catch((err) =>
                  setErro(err.message),
                )
              }
            >
              Exportar CSV
            </Btn>
            <Btn
              variant="secondary"
              onClick={() =>
                void downloadApi("/financeiro/export-xlsx", { method: "GET" }, "extrato-financeiro.xlsx").catch(
                  (err) => setErro(err.message),
                )
              }
            >
              Exportar Excel
            </Btn>
          </>
        }
      />

      {erro && <Err>{erro}</Err>}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {(["equipamento", "setor", "centroCusto"] as const).map((a) => (
          <Btn key={a} variant={agrupar === a ? "primary" : "ghost"} onClick={() => setAgrupar(a)}>
            {a === "centroCusto" ? "Centro de custo" : a.charAt(0).toUpperCase() + a.slice(1)}
          </Btn>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
        <KpiCard
          label="Total geral"
          value={dash ? brl(dash.totalGeral) : "—"}
          tone="info"
        />
        {(["MATERIAL", "MAO_DE_OBRA", "RATEIO", "GLOSA"] as const).map((t) => (
          <KpiCard
            key={t}
            label={t.replace(/_/g, " ")}
            value={dash?.porTipo?.[t] != null ? brl(Number(dash.porTipo[t])) : "—"}
            tone={t === "GLOSA" ? "danger" : "neutral"}
          />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 14 }}>
        <Panel title={`Breakdown por ${agrupar}`}>
          {(dash?.breakdown ?? []).slice(0, 15).map((b) => (
            <div
              key={b.chave}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: "1px solid oklch(0.93 0.005 255)",
                fontSize: 13,
                gap: 12,
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.chave}</span>
              <strong>{brl(b.total)}</strong>
            </div>
          ))}
          {(dash?.breakdown ?? []).length === 0 && <Empty text="Sem breakdown para este agrupamento." />}
        </Panel>

        <div>
          <DataTable>
            <thead>
              <tr>
                <th style={th}>Tipo</th>
                <th style={th}>Data</th>
                <th style={th}>Origem</th>
                <th style={th}>Descrição</th>
                <th style={th}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {extrato.slice(0, 50).map((l, i) => (
                <tr key={i}>
                  <td style={td}>
                    <Badge>{l.tipo}</Badge>
                  </td>
                  <td style={td}>{String(l.data).slice(0, 10)}</td>
                  <td style={td}>{l.origem}</td>
                  <td style={{ ...td, maxWidth: 220 }}>{l.descricao}</td>
                  <td
                    style={{
                      ...td,
                      fontWeight: 700,
                      color: l.valor < 0 ? "oklch(0.45 0.16 25)" : undefined,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {brl(l.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {extrato.length === 0 && <Empty text="Extrato vazio." />}
        </div>
      </div>
    </div>
  );
}
