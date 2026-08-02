"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Cand {
  equipamentoId: string;
  tag: string;
  nome: string;
  idadeAnos: number;
  custoAcumulado: number;
  prioridade: number;
  flags: { anvisaVencida: boolean; eos: boolean; eol: boolean };
  criterio: string[];
}

interface Capex {
  id: string;
  descricao: string;
  valorEstimado: string | number;
  justificativa: string;
  status: string;
  origem: string;
}

interface Plano {
  id: string;
  iniciativa: string;
  horizonteTexto?: string | null;
  status: string;
  investimentoPrevisto?: string | number | null;
}

export default function CapexPage() {
  const [cands, setCands] = useState<Cand[]>([]);
  const [capex, setCapex] = useState<Capex[]>([]);
  const [plano, setPlano] = useState<Plano[]>([]);
  const [tab, setTab] = useState<"sub" | "capex" | "plano">("sub");
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [c, x, p] = await Promise.all([
      api<Cand[]>("/gestao/substituicao-tecnologica"),
      api<Capex[]>("/gestao/capex"),
      api<Plano[]>("/gestao/plano-diretor"),
    ]);
    setCands(c);
    setCapex(x);
    setPlano(p);
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function gerarCapex(c: Cand) {
    const valor = Number(window.prompt("Valor estimado:", "50000") || 0);
    const justificativa = window.prompt("Justificativa:", `Substituição ${c.tag}`) || "";
    if (!justificativa) return;
    await api("/gestao/capex", {
      method: "POST",
      body: JSON.stringify({
        descricao: `Substituição ${c.tag} — ${c.nome}`,
        valorEstimado: valor,
        justificativa,
        equipamentoOrigemId: c.equipamentoId,
        origem: "SUBSTITUICAO",
      }),
    });
    setMsg("CAPEX proposto a partir da substituição");
    setTab("capex");
    await load();
  }

  async function createCapex(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/gestao/capex", {
      method: "POST",
      body: JSON.stringify({
        descricao: String(fd.get("descricao")),
        valorEstimado: Number(fd.get("valor")),
        justificativa: String(fd.get("justificativa")),
        origem: "MANUAL",
      }),
    });
    e.currentTarget.reset();
    await load();
  }

  async function status(id: string, status: string) {
    await api(`/gestao/capex/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  }

  async function createPlano(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/gestao/plano-diretor", {
      method: "POST",
      body: JSON.stringify({
        iniciativa: String(fd.get("iniciativa")),
        horizonteTexto: String(fd.get("horizonte") || "") || undefined,
        investimentoPrevisto: Number(fd.get("investimento") || 0) || undefined,
      }),
    });
    e.currentTarget.reset();
    await load();
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>CAPEX e Plano Diretor</h1>
      <p style={{ margin: "0 0 12px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Candidatos por idade, custo e regularidade · CAPEX manual ou de substituição
      </p>
      {msg && <div style={{ marginBottom: 10 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {([
          ["sub", "Substituição"],
          ["capex", "CAPEX"],
          ["plano", "Plano Diretor"],
        ] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ ...btn, background: tab === k ? "var(--nexo-brand)" : "var(--nexo-surface)", color: tab === k ? "white" : "inherit", border: "1px solid var(--nexo-border)" }}>
            {l}
          </button>
        ))}
      </div>

      {tab === "sub" && (
        <div style={{ display: "grid", gap: 8 }}>
          {cands.length === 0 && <div style={{ color: "var(--nexo-muted)" }}>Nenhum candidato no momento</div>}
          {cands.map((c) => (
            <div key={c.equipamentoId} style={{ ...card, display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <strong>{c.tag}</strong> · {c.nome}
                <div style={{ fontSize: 12, color: "var(--nexo-muted)" }}>
                  Prioridade {c.prioridade} · idade {c.idadeAnos}a · custo R$ {c.custoAcumulado} · {c.criterio.join(", ")}
                </div>
                <div style={{ fontSize: 12 }}>
                  {c.flags.anvisaVencida && "Anvisa vencida · "}
                  {c.flags.eos && "EoS · "}
                  {c.flags.eol && "EoL"}
                </div>
              </div>
              <button type="button" onClick={() => void gerarCapex(c)} style={btn}>Gerar CAPEX</button>
            </div>
          ))}
        </div>
      )}

      {tab === "capex" && (
        <div>
          <form onSubmit={(e) => void createCapex(e)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr auto", gap: 8, marginBottom: 14 }}>
            <input name="descricao" placeholder="Descrição" required style={input} />
            <input name="valor" type="number" placeholder="Valor" required style={input} />
            <input name="justificativa" placeholder="Justificativa" required style={input} />
            <button type="submit" style={btn}>Lançar</button>
          </form>
          {capex.map((c) => (
            <div key={c.id} style={{ ...card, marginBottom: 8 }}>
              <strong>{c.descricao}</strong> · {c.status} · {c.origem}
              <div style={{ fontSize: 13 }}>{c.justificativa}</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>R$ {Number(c.valorEstimado).toLocaleString("pt-BR")}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {["PROPOSTO", "APROVADO", "EXECUTADO"].map((s) => (
                  <button key={s} type="button" onClick={() => void status(c.id, s)} style={{ ...btn, fontSize: 11, padding: "4px 8px", background: c.status === s ? "var(--nexo-brand)" : "var(--nexo-bg)", color: c.status === s ? "white" : "inherit", border: "1px solid var(--nexo-border)" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "plano" && (
        <div>
          <form onSubmit={(e) => void createPlano(e)} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8, marginBottom: 14 }}>
            <input name="iniciativa" placeholder="Iniciativa" required style={input} />
            <input name="horizonte" placeholder="Horizonte (texto)" style={input} />
            <input name="investimento" type="number" placeholder="Investimento" style={input} />
            <button type="submit" style={btn}>Adicionar</button>
          </form>
          {plano.map((p) => (
            <div key={p.id} style={{ ...card, marginBottom: 8 }}>
              <strong>{p.iniciativa}</strong> · {p.status}
              <div style={{ fontSize: 12, color: "var(--nexo-muted)" }}>{p.horizonteTexto || "Documento vivo — sem horizonte fixo"}</div>
              {p.investimentoPrevisto != null && <div style={{ fontSize: 13 }}>R$ {Number(p.investimentoPrevisto).toLocaleString("pt-BR")}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--nexo-surface)", border: "1px solid var(--nexo-border)", borderRadius: 12, padding: 12 };
const input: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--nexo-border)", background: "var(--nexo-bg)" };
const btn: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "none", background: "var(--nexo-brand)", color: "white", fontWeight: 700, cursor: "pointer", height: "fit-content" };
