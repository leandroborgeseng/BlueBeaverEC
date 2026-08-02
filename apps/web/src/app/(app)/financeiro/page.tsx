"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function FinanceiroPage() {
  const [dash, setDash] = useState<{
    totalGeral: number;
    porTipo: Record<string, number>;
    breakdown: Array<{ chave: string; total: number }>;
  } | null>(null);
  const [extrato, setExtrato] = useState<Array<{ tipo: string; data: string; descricao: string; valor: number; origem: string }>>([]);
  const [agrupar, setAgrupar] = useState<"equipamento" | "setor" | "centroCusto">("equipamento");
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
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Financeiro</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Agregação de custos derivados (OS, rateio, glosas) — sem lançamento manual
      </p>
      {erro && <div style={{ color: "var(--nexo-danger)" }}>{erro}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(["equipamento", "setor", "centroCusto"] as const).map((a) => (
          <button key={a} type="button" onClick={() => setAgrupar(a)} style={{ ...btn, background: agrupar === a ? "var(--nexo-brand)" : "var(--nexo-surface)", color: agrupar === a ? "white" : "inherit", border: "1px solid var(--nexo-border)" }}>
            {a}
          </button>
        ))}
        <a href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/financeiro/export`} style={{ ...btn, textDecoration: "none", display: "inline-flex", alignItems: "center" }} onClick={(e) => {
          e.preventDefault();
          void api<string>("/financeiro/export").then((csv) => {
            const blob = new Blob([typeof csv === "string" ? csv : String(csv)], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "extrato.csv";
            a.click();
          }).catch(() => {
            // export retorna texto puro — usar fetch com token
            const token = localStorage.getItem("nexo_token");
            fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/financeiro/export`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            }).then((r) => r.text()).then((t) => {
              const blob = new Blob([t], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "extrato.csv";
              a.click();
            });
          });
        }}>
          Exportar CSV
        </a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
        <Kpi label="Total" value={dash?.totalGeral ?? "—"} />
        {(["MATERIAL", "MAO_DE_OBRA", "RATEIO", "GLOSA"] as const).map((t) => (
          <Kpi key={t} label={t} value={dash?.porTipo?.[t] != null ? Number(dash.porTipo[t].toFixed(2)) : "—"} />
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 14 }}>
        <section style={card}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Breakdown</h2>
          {(dash?.breakdown ?? []).slice(0, 15).map((b) => (
            <div key={b.chave} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--nexo-border)", fontSize: 13 }}>
              <span>{b.chave}</span>
              <strong>{b.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
            </div>
          ))}
        </section>
        <section style={card}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Extrato</h2>
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            {extrato.slice(0, 50).map((l, i) => (
              <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--nexo-border)", fontSize: 12 }}>
                <strong>{l.tipo}</strong> · {String(l.data).slice(0, 10)} · {l.origem}
                <div>{l.descricao}</div>
                <div style={{ color: l.valor < 0 ? "var(--nexo-danger)" : "inherit", fontWeight: 700 }}>
                  {l.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 11, color: "var(--nexo-muted)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--nexo-surface)", border: "1px solid var(--nexo-border)", borderRadius: 12, padding: 12 };
const btn: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "none", fontWeight: 700, cursor: "pointer", fontSize: 12 };
