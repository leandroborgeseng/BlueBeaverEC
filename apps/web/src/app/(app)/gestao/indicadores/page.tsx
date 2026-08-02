"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Ind {
  id: string;
  nome: string;
  categoria: string;
  valorAtual: number;
  meta: string | null;
  tendencia: string;
  sistema: boolean;
}

export default function IndicadoresPage() {
  const [inds, setInds] = useState<Ind[]>([]);
  const [hist, setHist] = useState<Array<{ periodo: string; valor: number }> | null>(null);
  const [sel, setSel] = useState<Ind | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setInds(await api<Ind[]>("/indicadores"));
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function openHist(ind: Ind) {
    setSel(ind);
    setHist(await api(`/indicadores/${ind.id}/historico?meses=6`));
  }

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/indicadores/construtor", {
      method: "POST",
      body: JSON.stringify({
        nome: String(fd.get("nome")),
        formula: String(fd.get("formula")),
        campos: String(fd.get("campos") || "").split(",").map((s) => s.trim()).filter(Boolean),
        metaTexto: String(fd.get("meta") || "") || undefined,
      }),
    });
    e.currentTarget.reset();
    setMsg("Indicador customizado criado");
    await load();
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Indicadores</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Cards com valor, meta e tendência · histórico de 6 meses
      </p>
      {msg && <div style={{ marginBottom: 10 }}>{msg}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginBottom: 18 }}>
        {inds.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => void openHist(i)}
            style={{ textAlign: "left", padding: 14, borderRadius: 12, border: "1px solid var(--nexo-border)", background: "var(--nexo-surface)", cursor: "pointer" }}
          >
            <div style={{ fontSize: 11, color: "var(--nexo-muted)" }}>{i.categoria}{i.sistema ? " · sistema" : ""}</div>
            <div style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}>{i.nome}</div>
            <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{i.valorAtual}</div>
            <div style={{ fontSize: 12, color: "var(--nexo-muted)" }}>Meta: {i.meta ?? "—"} · {i.tendencia}</div>
          </button>
        ))}
      </div>

      {sel && hist && (
        <section style={{ padding: 14, borderRadius: 12, border: "1px solid var(--nexo-border)", background: "var(--nexo-surface)", marginBottom: 18 }}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>{sel.nome} — 6 meses</h2>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
            {hist.map((h) => {
              const max = Math.max(...hist.map((x) => x.valor), 1);
              const hgt = Math.max(8, (h.valor / max) * 100);
              return (
                <div key={h.periodo} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ height: 100, alignItems: "flex-end", display: "flex" }}>
                    <div style={{ width: "100%", height: hgt, background: "var(--nexo-brand)", borderRadius: "6px 6px 0 0" }} title={String(h.valor)} />
                  </div>
                  <div style={{ fontSize: 10, color: "var(--nexo-muted)" }}>{h.periodo.slice(5)}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section style={{ padding: 14, borderRadius: 12, border: "1px solid var(--nexo-border)", background: "var(--nexo-surface)" }}>
        <h2 style={{ marginTop: 0, fontSize: 15 }}>Construtor</h2>
        <form onSubmit={(e) => void criar(e)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr 1fr auto", gap: 8 }}>
          <input name="nome" placeholder="Nome" required style={input} />
          <select name="formula" style={input}>
            <option value="PERCENTUAL">Percentual</option>
            <option value="CONTAGEM">Contagem</option>
            <option value="MEDIA">Média</option>
            <option value="SOMA">Soma</option>
          </select>
          <input name="campos" placeholder="Campos (OS,Equipamentos…)" style={input} />
          <input name="meta" placeholder="Meta" style={input} />
          <button type="submit" style={btn}>Criar</button>
        </form>
      </section>
    </div>
  );
}

const input: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--nexo-border)", background: "var(--nexo-bg)" };
const btn: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "none", background: "var(--nexo-brand)", color: "white", fontWeight: 700, cursor: "pointer" };
