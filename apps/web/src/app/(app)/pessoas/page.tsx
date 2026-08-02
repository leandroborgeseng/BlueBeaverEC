"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Colab {
  id: string;
  nome: string;
  matricula: string;
  cargo?: string | null;
  cargaAtual: number;
  sobrecarga: boolean;
  competencias: Array<{ nome: string; validade?: string | null }>;
  competenciasVencidas: Array<{ nome: string }>;
}

interface Equipe {
  id: string;
  nome: string;
  turno?: string | null;
  membros: Array<{ colaborador: { nome: string } }>;
}

export default function PessoasPage() {
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [c, e] = await Promise.all([
      api<Colab[]>("/pessoas/colaboradores"),
      api<Equipe[]>("/pessoas/equipes"),
    ]);
    setColabs(c);
    setEquipes(e);
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function createColab(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/pessoas/colaboradores", {
        method: "POST",
        body: JSON.stringify({
          matricula: String(fd.get("matricula")),
          nome: String(fd.get("nome")),
          cargo: String(fd.get("cargo") || "") || undefined,
        }),
      });
      e.currentTarget.reset();
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  async function createEquipe(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api("/pessoas/equipes", {
        method: "POST",
        body: JSON.stringify({
          nome: String(fd.get("nome")),
          turno: String(fd.get("turno") || "") || undefined,
          membroIds: String(fd.get("membroIds") || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      });
      e.currentTarget.reset();
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Pessoas e Equipes</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Carga ≥ 2 destaca sobrecarga · certificação vencida só alerta
      </p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <section style={card}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Colaboradores</h2>
          <form onSubmit={(e) => void createColab(e)} style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <input name="matricula" placeholder="Matrícula" required style={input} />
            <input name="nome" placeholder="Nome" required style={input} />
            <input name="cargo" placeholder="Cargo" style={input} />
            <button type="submit" style={btn}>Adicionar</button>
          </form>
          {colabs.map((c) => (
            <div
              key={c.id}
              style={{
                padding: "10px 0",
                borderTop: "1px solid var(--nexo-border)",
                background: c.sobrecarga ? "oklch(0.97 0.04 40)" : undefined,
                borderRadius: 8,
                paddingLeft: c.sobrecarga ? 8 : 0,
              }}
            >
              <strong>{c.nome}</strong> · {c.matricula} · carga {c.cargaAtual}
              {c.sobrecarga && <span style={{ color: "var(--nexo-danger)", fontWeight: 700 }}> · SOBRECARGA</span>}
              {c.competenciasVencidas.length > 0 && (
                <div style={{ fontSize: 12, color: "var(--nexo-warning)" }}>
                  Certificação vencida: {c.competenciasVencidas.map((x) => x.nome).join(", ")}
                </div>
              )}
            </div>
          ))}
        </section>

        <section style={card}>
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Equipes</h2>
          <form onSubmit={(e) => void createEquipe(e)} style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            <input name="nome" placeholder="Nome da equipe" required style={input} />
            <input name="turno" placeholder="Turno" style={input} />
            <input name="membroIds" placeholder="IDs membros (cuid,cuid)" style={input} />
            <button type="submit" style={btn}>Criar equipe</button>
          </form>
          {equipes.map((eq) => (
            <div key={eq.id} style={{ padding: "10px 0", borderTop: "1px solid var(--nexo-border)" }}>
              <strong>{eq.nome}</strong> {eq.turno ? `· ${eq.turno}` : ""}
              <div style={{ fontSize: 12, color: "var(--nexo-muted)" }}>
                {eq.membros.map((m) => m.colaborador.nome).join(", ") || "Sem membros"}
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
const card: React.CSSProperties = { background: "var(--nexo-surface)", border: "1px solid var(--nexo-border)", borderRadius: 12, padding: 14 };
