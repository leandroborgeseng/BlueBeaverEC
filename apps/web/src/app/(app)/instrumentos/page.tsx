"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Inst {
  id: string;
  nome: string;
  nSerie: string;
  certificadoValidade?: string | null;
  vencido: boolean;
  selecionavel: boolean;
  laboratorioEmissor?: string | null;
}

export default function InstrumentosPage() {
  const [items, setItems] = useState<Inst[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setItems(await api<Inst[]>("/instrumentos-padroes"));
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/instrumentos-padroes", {
        method: "POST",
        body: JSON.stringify({
          nome: String(fd.get("nome")),
          nSerie: String(fd.get("nSerie")),
          certificadoNumero: String(fd.get("certificadoNumero") || "") || undefined,
          certificadoValidade: String(fd.get("certificadoValidade") || "") || undefined,
          laboratorioEmissor: String(fd.get("laboratorioEmissor") || "") || undefined,
        }),
      });
      e.currentTarget.reset();
      setMsg("Instrumento cadastrado");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Instrumentos e Padrões</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Certificado vencido bloqueia uso em novos laudos
      </p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <form onSubmit={(e) => void onCreate(e)} style={{ ...card, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8, marginBottom: 16 }}>
        <input name="nome" placeholder="Nome" required style={input} />
        <input name="nSerie" placeholder="Nº série" required style={input} />
        <input name="certificadoNumero" placeholder="Certificado" style={input} />
        <input name="certificadoValidade" type="date" style={input} />
        <button type="submit" style={btn}>+</button>
      </form>

      <div style={{ display: "grid", gap: 10 }}>
        {items.map((i) => (
          <div key={i.id} style={card}>
            <strong>{i.nome}</strong> · {i.nSerie}
            <div style={{ fontSize: 12, color: i.vencido ? "var(--nexo-danger)" : "var(--nexo-muted)" }}>
              {i.vencido ? "CERTIFICADO VENCIDO — bloqueado" : "Selecionável para laudos"}
              {i.certificadoValidade ? ` · val. ${new Date(i.certificadoValidade).toLocaleDateString("pt-BR")}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const input: React.CSSProperties = { border: "1px solid var(--nexo-border)", borderRadius: 10, padding: "10px 12px" };
const btn: React.CSSProperties = { border: "none", borderRadius: 10, padding: "10px 14px", background: "var(--nexo-primary)", color: "white", fontWeight: 700 };
const card: React.CSSProperties = { background: "var(--nexo-surface)", border: "1px solid var(--nexo-border)", borderRadius: 12, padding: 14 };
