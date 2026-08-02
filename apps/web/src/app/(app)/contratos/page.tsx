"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Contrato {
  id: string;
  numero: string;
  descricao: string;
  valor: string | number;
  vigenciaFim: string;
  situacaoCalculada: string;
  alertaSeveridade: string | null;
  rateioPorEquipamento: number;
  totalGlosas: number;
  fornecedor: { nome: string };
  equipamentos: Array<{ equipamento: { tag: string } }>;
}

interface Fornecedor {
  id: string;
  nome: string;
}

export default function ContratosPage() {
  const [items, setItems] = useState<Contrato[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [c, f] = await Promise.all([
      api<Contrato[]>("/contratos"),
      api<Fornecedor[]>("/fornecedores"),
    ]);
    setItems(c);
    setFornecedores(f);
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const tags = String(fd.get("equipamentoTags") || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await api("/contratos", {
        method: "POST",
        body: JSON.stringify({
          numero: String(fd.get("numero")),
          fornecedorId: String(fd.get("fornecedorId")),
          descricao: String(fd.get("descricao")),
          vigenciaInicio: String(fd.get("vigenciaInicio")),
          vigenciaFim: String(fd.get("vigenciaFim")),
          valor: Number(fd.get("valor")),
          equipamentoTags: tags,
          indiceReajuste: "IPCA",
        }),
      });
      e.currentTarget.reset();
      setMsg("Contrato criado");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  async function glosa(numero: string) {
    const motivo = window.prompt("Motivo da glosa:");
    const valor = Number(window.prompt("Valor da glosa:") || 0);
    if (!motivo || !valor) return;
    try {
      await api(`/contratos/${numero}/glosas`, {
        method: "POST",
        body: JSON.stringify({ valor, motivo }),
      });
      setMsg("Glosa registrada");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Contratos</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        N:N com equipamentos · rateio igualitário · alertas 90/60/30
      </p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <form onSubmit={(e) => void onCreate(e)} style={{ ...card, display: "grid", gap: 8, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 8 }}>
          <input name="numero" placeholder="Número" required style={input} />
          <input name="descricao" placeholder="Descrição" required style={input} />
          <input name="valor" type="number" placeholder="Valor" required style={input} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8 }}>
          <select name="fornecedorId" required defaultValue="" style={input}>
            <option value="" disabled>Fornecedor</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </select>
          <input name="vigenciaInicio" type="date" required style={input} />
          <input name="vigenciaFim" type="date" required style={input} />
          <input name="equipamentoTags" placeholder="TAGs (EQ-0001,EQ-0002)" style={input} />
          <button type="submit" style={btn}>+</button>
        </div>
      </form>

      <div style={{ display: "grid", gap: 10 }}>
        {items.map((c) => (
          <article key={c.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <strong>{c.numero}</strong> · {c.fornecedor.nome}
                <div style={{ fontSize: 13, color: "var(--nexo-muted)" }}>{c.descricao}</div>
              </div>
              <div style={{ textAlign: "right", fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: sevColor(c.alertaSeveridade) }}>
                  {c.situacaoCalculada}
                  {c.alertaSeveridade ? ` · ${c.alertaSeveridade}d` : ""}
                </div>
                <div>Fim {new Date(c.vigenciaFim).toLocaleDateString("pt-BR")}</div>
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              Valor {Number(c.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              {" · "}rateio {c.rateioPorEquipamento.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              {" · "}glosas {c.totalGlosas.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              {" · "}{c.equipamentos.map((e) => e.equipamento.tag).join(", ") || "sem cobertura"}
            </div>
            <button type="button" style={{ ...btn, marginTop: 10, background: "var(--nexo-brand)" }} onClick={() => void glosa(c.numero)}>
              Registrar glosa
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

function sevColor(s: string | null) {
  if (s === "VENCIDO" || s === "30") return "var(--nexo-danger)";
  if (s === "60") return "var(--nexo-warning)";
  if (s === "90") return "var(--nexo-primary)";
  return "var(--nexo-success)";
}

const input: React.CSSProperties = { border: "1px solid var(--nexo-border)", borderRadius: 10, padding: "10px 12px", width: "100%" };
const btn: React.CSSProperties = { border: "none", borderRadius: 10, padding: "10px 14px", background: "var(--nexo-primary)", color: "white", fontWeight: 700, cursor: "pointer" };
const card: React.CSSProperties = { background: "var(--nexo-surface)", border: "1px solid var(--nexo-border)", borderRadius: 12, padding: 14 };
