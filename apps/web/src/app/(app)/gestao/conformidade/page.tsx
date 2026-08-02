"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Req {
  id: string;
  codigo: string;
  norma: string;
  texto: string;
  categoria: string;
  status?: string;
  evidencia?: { descricao?: string | null } | null;
}

export default function ConformidadePage() {
  const [itens, setItens] = useState<Req[]>([]);
  const [tab, setTab] = useState<"conf" | "req" | "pop">("conf");
  const [pops, setPops] = useState<Array<{ id: string; codigo: string; titulo: string; versao: string }>>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [c, p] = await Promise.all([
      api<Req[]>("/estrategico/conformidade"),
      api<Array<{ id: string; codigo: string; titulo: string; versao: string }>>("/estrategico/pops"),
    ]);
    setItens(c);
    setPops(p);
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function evidenciar(requisitoId: string) {
    const descricao = window.prompt("Descrição da evidência:");
    if (!descricao) return;
    const status = window.prompt("Status (CONFORME|PARCIAL|NAO_CONFORME):", "CONFORME") || "CONFORME";
    await api("/estrategico/evidencias", {
      method: "POST",
      body: JSON.stringify({ requisitoId, tipo: "documento", descricao, status }),
    });
    await load();
  }

  async function createPop(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await api("/estrategico/pops", {
      method: "POST",
      body: JSON.stringify({
        codigo: String(fd.get("codigo")),
        titulo: String(fd.get("titulo")),
        procedimentoLaudoId: String(fd.get("procedimentoLaudoId") || "") || undefined,
      }),
    });
    e.currentTarget.reset();
    setMsg("POP criado (vínculo 1:1 com procedimento, se informado)");
    await load();
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Conformidade e POPs</h1>
      <p style={{ margin: "0 0 12px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Catálogo de requisitos pré-cadastrado · evidências · biblioteca de POPs
      </p>
      {msg && <div style={{ marginBottom: 10 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {(["conf", "req", "pop"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{ ...btn, background: tab === t ? "var(--nexo-brand)" : "var(--nexo-surface)", color: tab === t ? "white" : "var(--nexo-text)", border: "1px solid var(--nexo-border)" }}>
            {t === "conf" ? "Central" : t === "req" ? "Catálogo" : "POPs"}
          </button>
        ))}
      </div>

      {tab !== "pop" && (
        <div style={{ display: "grid", gap: 8 }}>
          {itens.map((r) => (
            <div key={r.id} style={{ padding: 12, borderRadius: 10, border: "1px solid var(--nexo-border)", background: "var(--nexo-surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <strong>{r.codigo}</strong> · {r.norma}
                  <div style={{ fontSize: 13 }}>{r.texto}</div>
                  <div style={{ fontSize: 12, color: "var(--nexo-muted)" }}>{r.categoria} · {r.status ?? "SEM_EVIDENCIA"}</div>
                </div>
                {tab === "conf" && (
                  <button type="button" onClick={() => void evidenciar(r.id)} style={btn}>Evidenciar</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "pop" && (
        <div>
          <form onSubmit={(e) => void createPop(e)} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr auto", gap: 8, marginBottom: 14 }}>
            <input name="codigo" placeholder="Código" required style={input} />
            <input name="titulo" placeholder="Título" required style={input} />
            <input name="procedimentoLaudoId" placeholder="ID procedimento (opcional)" style={input} />
            <button type="submit" style={btn}>Novo POP</button>
          </form>
          {pops.map((p) => (
            <div key={p.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--nexo-border)", fontSize: 13 }}>
              <strong>{p.codigo}</strong> · {p.titulo} · v{p.versao}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const input: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--nexo-border)", background: "var(--nexo-bg)" };
const btn: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "none", background: "var(--nexo-brand)", color: "white", fontWeight: 700, cursor: "pointer", height: "fit-content" };
