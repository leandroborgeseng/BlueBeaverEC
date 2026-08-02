"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Dom {
  id: string;
  codigo: string;
  nome: string;
  peso: number;
  avaliacao: { nivel: number; planoAcao?: string | null } | null;
}

export default function MaturidadePage() {
  const [dominios, setDominios] = useState<Dom[]>([]);
  const [sel, setSel] = useState<Dom | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setDominios(await api<Dom[]>("/estrategico/maturidade/dominios"));
  }

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, []);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sel) return;
    const fd = new FormData(e.currentTarget);
    await api(`/estrategico/maturidade/dominios/${sel.id}`, {
      method: "PUT",
      body: JSON.stringify({
        nivel: Number(fd.get("nivel")),
        planoAcao: String(fd.get("planoAcao") || "") || undefined,
        gaps: String(fd.get("gaps") || "")
          .split("\n")
          .filter(Boolean)
          .map((g) => ({ label: g, atendido: false })),
      }),
    });
    setMsg("Avaliação salva — índice recalculado automaticamente");
    setSel(null);
    await load();
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Avaliação de Maturidade</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Domínios com nível 1–5 · gaps e plano de ação
      </p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
        {dominios.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setSel(d)}
            style={{
              textAlign: "left",
              padding: 14,
              borderRadius: 12,
              border: "1px solid var(--nexo-border)",
              background: "var(--nexo-surface)",
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 14 }}>{d.nome}</div>
            <div style={{ fontSize: 12, color: "var(--nexo-muted)", marginTop: 4 }}>
              {d.avaliacao ? `Nível ${d.avaliacao.nivel}` : "Não avaliado"} · peso {d.peso}
            </div>
          </button>
        ))}
      </div>

      {sel && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.35)",
            display: "grid",
            placeItems: "center",
            zIndex: 50,
          }}
          onClick={() => setSel(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void salvar(e)}
            style={{
              width: 420,
              background: "var(--nexo-surface)",
              borderRadius: 14,
              padding: 18,
              display: "grid",
              gap: 10,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16 }}>{sel.nome}</h2>
            <label style={{ fontSize: 13 }}>
              Nível (1–5)
              <input name="nivel" type="number" min={1} max={5} defaultValue={sel.avaliacao?.nivel ?? 3} required style={input} />
            </label>
            <label style={{ fontSize: 13 }}>
              Gaps (um por linha)
              <textarea name="gaps" rows={3} style={input} placeholder="Lacuna 1&#10;Lacuna 2" />
            </label>
            <label style={{ fontSize: 13 }}>
              Plano de ação
              <textarea name="planoAcao" rows={2} defaultValue={sel.avaliacao?.planoAcao ?? ""} style={input} />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={btn}>Salvar</button>
              <button type="button" onClick={() => setSel(null)} style={{ ...btn, background: "transparent", color: "var(--nexo-text)", border: "1px solid var(--nexo-border)" }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const input: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--nexo-border)",
  background: "var(--nexo-bg)",
};
const btn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: "var(--nexo-brand)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};
