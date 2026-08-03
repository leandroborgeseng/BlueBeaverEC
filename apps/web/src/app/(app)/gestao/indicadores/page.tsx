"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Btn,
  FieldLabel,
  KpiCard,
  PageHeader,
  Panel,
  fieldStyle,
} from "@/components/ui/aion-ui";

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
      <PageHeader title="Indicadores" subtitle="Cards com valor, meta e tendência · histórico de 6 meses" />
      {msg && <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600 }}>{msg}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 18 }}>
        {inds.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => void openHist(i)}
            style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            <KpiCard
              label={`${i.categoria}${i.sistema ? " · sistema" : ""}`}
              value={i.valorAtual}
              hint={`Meta: ${i.meta ?? "—"} · ${i.tendencia}`}
              tone={i.tendencia.includes("↓") ? "danger" : i.tendencia.includes("↑") ? "success" : "neutral"}
            />
            <div style={{ fontWeight: 700, fontSize: 14, marginTop: -8, paddingLeft: 16, paddingBottom: 8 }}>{i.nome}</div>
          </button>
        ))}
      </div>

      {sel && hist && (
        <Panel title={`${sel.nome} — histórico 6 meses`}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 160, marginBottom: 8 }}>
            {hist.map((h) => {
              const max = Math.max(...hist.map((x) => x.valor), 1);
              const hgt = Math.max(12, (h.valor / max) * 120);
              return (
                <div key={h.periodo} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{h.valor}</div>
                  <div style={{ height: 120, alignItems: "flex-end", display: "flex" }}>
                    <div
                      style={{
                        width: "100%",
                        height: hgt,
                        background: "linear-gradient(180deg, oklch(0.62 0.16 255), oklch(0.48 0.14 255))",
                        borderRadius: "6px 6px 0 0",
                        transition: "height 0.35s ease",
                      }}
                      title={`${h.periodo}: ${h.valor}`}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>{h.periodo.slice(5)}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
            Meta: {sel.meta ?? "—"} · tendência {sel.tendencia}
          </div>
        </Panel>
      )}

      <Panel title="Construtor">
        <form onSubmit={(e) => void criar(e)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr 1fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <FieldLabel>Nome</FieldLabel>
            <input name="nome" placeholder="Nome" required style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Fórmula</FieldLabel>
            <select name="formula" style={fieldStyle}>
              <option value="PERCENTUAL">Percentual</option>
              <option value="CONTAGEM">Contagem</option>
              <option value="MEDIA">Média</option>
              <option value="SOMA">Soma</option>
            </select>
          </div>
          <div>
            <FieldLabel>Campos</FieldLabel>
            <input name="campos" placeholder="Campos (OS,Equipamentos…)" style={fieldStyle} />
          </div>
          <div>
            <FieldLabel>Meta</FieldLabel>
            <input name="meta" placeholder="Meta" style={fieldStyle} />
          </div>
          <Btn type="submit">Criar</Btn>
        </form>
      </Panel>
    </div>
  );
}
