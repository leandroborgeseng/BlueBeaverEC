"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Aud {
  id: string;
  codigo: string;
  escopo: string;
  status: string;
  achados: Array<{ id: string; codigo: string; descricao: string; status: string; planosAcao: Array<{ id: string; descricao: string; prazo?: string | null; escalonadoEm?: string | null }> }>;
}

interface Nc {
  id: string;
  codigo: string;
  descricao: string;
  origem: string;
  status: string;
  planosAcao: Array<{ id: string; descricao: string; prazo?: string | null; escalonadoEm?: string | null }>;
}

export default function AuditoriasPage() {
  const [auds, setAuds] = useState<Aud[]>([]);
  const [ncs, setNcs] = useState<Nc[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [a, n] = await Promise.all([
      api<Aud[]>("/auditorias"),
      api<Nc[]>("/nao-conformidades"),
    ]);
    setAuds(a);
    setNcs(n);
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function createAud(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/auditorias", { method: "POST", body: JSON.stringify({ escopo: String(fd.get("escopo")) }) });
    e.currentTarget.reset();
    await load();
  }

  async function createNc(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/nao-conformidades", {
      method: "POST",
      body: JSON.stringify({
        descricao: String(fd.get("descricao")),
        origem: String(fd.get("origem") || "Livre"),
        auditoriaId: String(fd.get("auditoriaId") || "") || undefined,
      }),
    });
    e.currentTarget.reset();
    await load();
  }

  async function fechar(id: string) {
    const justificativa = window.prompt("Justificativa de fechamento:");
    if (!justificativa) return;
    await api(`/nao-conformidades/${id}/fechar`, {
      method: "POST",
      body: JSON.stringify({ justificativa }),
    });
    await load();
  }

  async function plano(id: string) {
    const descricao = window.prompt("Plano de ação:");
    const prazo = window.prompt("Prazo (YYYY-MM-DD):") || undefined;
    if (!descricao) return;
    await api(`/nao-conformidades/${id}/planos-acao`, {
      method: "POST",
      body: JSON.stringify({ descricao, prazo }),
    });
    await load();
  }

  async function escalonar() {
    const res = await api<{ escalonados: number }>("/auditorias/escalonar-planos", { method: "POST" });
    setMsg(`${res.escalonados} plano(s) escalonados ao gestor`);
    await load();
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Auditorias e NC</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Planejada → Em Execução ao registrar achados · plano vencido escala automaticamente
      </p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}
      <button type="button" onClick={() => void escalonar()} style={{ ...btn, marginBottom: 16, background: "var(--nexo-brand)" }}>
        Rodar escalonamento de planos vencidos
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <section style={card}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Auditorias</h2>
          <form onSubmit={(e) => void createAud(e)} style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <input name="escopo" placeholder="Escopo" required style={input} />
            <button type="submit" style={btn}>Nova auditoria</button>
          </form>
          {auds.map((a) => (
            <div key={a.id} style={{ borderTop: "1px solid var(--nexo-border)", padding: "10px 0" }}>
              <strong>{a.codigo}</strong> · {a.status}
              <div style={{ fontSize: 13 }}>{a.escopo}</div>
              <div style={{ fontSize: 12, color: "var(--nexo-muted)" }}>{a.achados.length} achados</div>
            </div>
          ))}
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Não Conformidades</h2>
          <form onSubmit={(e) => void createNc(e)} style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <textarea name="descricao" placeholder="Descrição" required style={input} rows={2} />
            <input name="origem" placeholder="Origem (Livre / OS-xxx / Auditoria)" defaultValue="Livre" style={input} />
            <select name="auditoriaId" defaultValue="" style={input}>
              <option value="">Sem auditoria</option>
              {auds.map((a) => (
                <option key={a.id} value={a.id}>{a.codigo}</option>
              ))}
            </select>
            <button type="submit" style={btn}>Abrir NC</button>
          </form>
          {ncs.map((n) => (
            <div key={n.id} style={{ borderTop: "1px solid var(--nexo-border)", padding: "10px 0" }}>
              <strong>{n.codigo}</strong> · {n.status} · {n.origem}
              <div style={{ fontSize: 13 }}>{n.descricao}</div>
              {n.planosAcao.map((p) => (
                <div key={p.id} style={{ fontSize: 12, color: p.escalonadoEm ? "var(--nexo-danger)" : "var(--nexo-muted)" }}>
                  Plano: {p.descricao}
                  {p.prazo ? ` · prazo ${new Date(p.prazo).toLocaleDateString("pt-BR")}` : ""}
                  {p.escalonadoEm ? " · ESCALONADO" : ""}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button type="button" style={ghost} onClick={() => void plano(n.id)}>Plano</button>
                {n.status !== "FECHADA" && (
                  <button type="button" style={ghost} onClick={() => void fechar(n.id)}>Fechar</button>
                )}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

const input: React.CSSProperties = { border: "1px solid var(--nexo-border)", borderRadius: 10, padding: "10px 12px", width: "100%" };
const btn: React.CSSProperties = { border: "none", borderRadius: 10, padding: "10px 14px", background: "var(--nexo-primary)", color: "white", fontWeight: 700 };
const ghost: React.CSSProperties = { ...btn, background: "white", color: "var(--nexo-text)", border: "1px solid var(--nexo-border)", fontSize: 12, padding: "6px 10px" };
const card: React.CSSProperties = { background: "var(--nexo-surface)", border: "1px solid var(--nexo-border)", borderRadius: 12, padding: 14 };
