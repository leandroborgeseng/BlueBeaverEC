"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Proc {
  id: string;
  nome: string;
  tipo: string;
  validadeMeses: number;
  itens: unknown[];
  modelos: Array<{ modelo: { id: string; nome: string; fabricante: { nome: string } } }>;
}

interface Modelo {
  id: string;
  nome: string;
  fabricante: { nome: string };
}

export default function ProcedimentosPage() {
  const [items, setItems] = useState<Proc[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [p, m] = await Promise.all([
      api<Proc[]>("/procedimentos-laudo"),
      api<Modelo[]>("/modelos"),
    ]);
    setItems(p);
    setModelos(m);
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const tipo = String(fd.get("tipo"));
    const defaultItens =
      tipo === "CALIBRACAO"
        ? [
            { id: "p0", pergunta: "0%", valorPadrao: 0 },
            { id: "p25", pergunta: "25%", valorPadrao: 25 },
            { id: "p50", pergunta: "50%", valorPadrao: 50 },
            { id: "p75", pergunta: "75%", valorPadrao: 75 },
            { id: "p100", pergunta: "100%", valorPadrao: 100 },
          ]
        : tipo === "TSE"
          ? [
              { id: "aterramento", pergunta: "Aterramento", limite: 0.1 },
              { id: "isolamento", pergunta: "Isolamento", limite: 1 },
              { id: "fuga", pergunta: "Fuga para terra", limite: 500 },
            ]
          : [
              { id: "1", pergunta: "Aspecto visual adequado" },
              { id: "2", pergunta: "Funcionamento conforme especificação" },
              { id: "3", pergunta: "Acessórios completos" },
            ];

    try {
      await api("/procedimentos-laudo", {
        method: "POST",
        body: JSON.stringify({
          nome: String(fd.get("nome")),
          tipo,
          validadeMeses: Number(fd.get("validadeMeses") || 12),
          itens: defaultItens,
        }),
      });
      e.currentTarget.reset();
      setMsg("Procedimento criado");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  async function vincular(procId: string, modeloId: string) {
    if (!modeloId) return;
    try {
      await api(`/procedimentos-laudo/${procId}/vincular`, {
        method: "POST",
        body: JSON.stringify({ modeloId }),
      });
      setMsg("Modelo vinculado (exclusivo por tipo)");
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Procedimentos de Laudo</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Base reutilizável · vínculo exclusivo por modelo/tipo
      </p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <form
        onSubmit={(e) => void onCreate(e)}
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr auto",
          gap: 8,
          marginBottom: 16,
          background: "var(--nexo-surface)",
          border: "1px solid var(--nexo-border)",
          borderRadius: 12,
          padding: 12,
        }}
      >
        <input name="nome" placeholder="Nome do procedimento" required style={input} />
        <select name="tipo" defaultValue="PREVENTIVA" style={input}>
          <option value="RECEBIMENTO">Recebimento</option>
          <option value="PREVENTIVA">Preventiva</option>
          <option value="CALIBRACAO">Calibração</option>
          <option value="TSE">TSE</option>
        </select>
        <input name="validadeMeses" type="number" defaultValue={12} min={1} style={input} />
        <button type="submit" style={btn}>
          + Novo
        </button>
      </form>

      <div style={{ display: "grid", gap: 12 }}>
        {items.map((p) => (
          <article key={p.id} style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <strong>{p.nome}</strong>
                <div style={{ fontSize: 12, color: "var(--nexo-muted)" }}>
                  {p.tipo} · validade {p.validadeMeses} meses · {(p.itens as unknown[]).length} itens
                </div>
              </div>
              <select
                defaultValue=""
                onChange={(e) => void vincular(p.id, e.target.value)}
                style={{ ...input, width: 260 }}
              >
                <option value="">Vincular modelo…</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fabricante.nome} / {m.nome}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 10, fontSize: 12 }}>
              {p.modelos.length === 0
                ? "Sem modelos vinculados"
                : p.modelos
                    .map((m) => `${m.modelo.fabricante.nome} / ${m.modelo.nome}`)
                    .join(" · ")}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

const input: React.CSSProperties = { border: "1px solid var(--nexo-border)", borderRadius: 10, padding: "10px 12px" };
const btn: React.CSSProperties = { border: "none", borderRadius: 10, padding: "10px 14px", background: "var(--nexo-primary)", color: "white", fontWeight: 700 };
const card: React.CSSProperties = { background: "var(--nexo-surface)", border: "1px solid var(--nexo-border)", borderRadius: 12, padding: 14 };
