"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface OsRow {
  id: string;
  numero: number;
  codigo: string;
  prioridade: string;
  atrasada: boolean;
  equipamento: { tag: string; nome: string };
}

interface Colab {
  id: string;
  nome: string;
  matricula: string;
}

export default function NaoAtribuidasPage() {
  const [items, setItems] = useState<OsRow[]>([]);
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [sel, setSel] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const [os, c] = await Promise.all([
      api<OsRow[]>("/os/nao-atribuidas"),
      api<Colab[]>("/pessoas/colaboradores"),
    ]);
    setItems(os);
    setColabs(c.filter((x) => x.matricula));
  }

  useEffect(() => {
    void load().catch(() => {
      setItems([]);
      setColabs([]);
    });
  }, []);

  async function atribuir(numero: number) {
    const responsavelId = sel[String(numero)];
    if (!responsavelId) {
      setMsg("Selecione um colaborador");
      return;
    }
    await api(`/os/${numero}/atribuir`, {
      method: "PATCH",
      body: JSON.stringify({ responsavelId }),
    });
    setMsg(`OS-${numero} atribuída`);
    await load();
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Fila Não Atribuídas</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Ordenada por prioridade e data de abertura · atribuição pelo engenheiro
      </p>
      {msg && <div style={{ marginBottom: 10 }}>{msg}</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {items.map((os) => (
          <div
            key={os.id}
            style={{
              background: "var(--nexo-surface)",
              border: "1px solid var(--nexo-border)",
              borderRadius: 12,
              padding: 14,
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 10,
              alignItems: "center",
            }}
          >
            <div>
              <strong>{os.codigo}</strong>
              <div style={{ fontSize: 13, color: "var(--nexo-muted)" }}>
                {os.equipamento.tag} — {os.equipamento.nome}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700 }}>
                {os.prioridade}
                {os.atrasada && <span style={{ color: "var(--nexo-danger)" }}> · ATRASADA</span>}
              </div>
            </div>
            <select
              value={sel[String(os.numero)] ?? ""}
              onChange={(e) => setSel((s) => ({ ...s, [String(os.numero)]: e.target.value }))}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--nexo-border)" }}
            >
              <option value="">Técnico…</option>
              {colabs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.matricula})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void atribuir(os.numero)}
              style={{
                border: "none",
                borderRadius: 8,
                padding: "8px 12px",
                background: "var(--nexo-brand)",
                color: "white",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Atribuir
            </button>
          </div>
        ))}
        {items.length === 0 && <div style={{ color: "var(--nexo-muted)" }}>Fila vazia</div>}
      </div>
    </div>
  );
}
