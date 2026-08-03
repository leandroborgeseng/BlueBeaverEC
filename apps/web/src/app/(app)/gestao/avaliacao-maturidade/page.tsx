"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Btn,
  FieldLabel,
  PageHeader,
  Surface,
  fieldStyle,
} from "@/components/ui/aion-ui";

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
      <PageHeader title="Avaliação de Maturidade" subtitle="Domínios com nível 1–5 · gaps e plano de ação" />
      {msg && <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>{msg}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
        {dominios.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setSel(d)}
            style={{ textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
          >
            <Surface>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{d.nome}</div>
              <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                {d.avaliacao ? `Nível ${d.avaliacao.nivel}` : "Não avaliado"} · peso {d.peso}
              </div>
            </Surface>
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
          <div onClick={(e) => e.stopPropagation()}>
          <Surface style={{ width: 420 }}>
            <form onSubmit={(e) => void salvar(e)} style={{ display: "grid", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>{sel.nome}</h2>
              <div>
                <FieldLabel>Nível (1–5)</FieldLabel>
                <input name="nivel" type="number" min={1} max={5} defaultValue={sel.avaliacao?.nivel ?? 3} required style={fieldStyle} />
              </div>
              <div>
                <FieldLabel>Gaps (um por linha)</FieldLabel>
                <textarea name="gaps" rows={3} style={fieldStyle} placeholder="Lacuna 1&#10;Lacuna 2" />
              </div>
              <div>
                <FieldLabel>Plano de ação</FieldLabel>
                <textarea name="planoAcao" rows={2} defaultValue={sel.avaliacao?.planoAcao ?? ""} style={fieldStyle} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn type="submit">Salvar</Btn>
                <Btn variant="ghost" onClick={() => setSel(null)}>Cancelar</Btn>
              </div>
            </form>
          </Surface>
          </div>
        </div>
      )}
    </div>
  );
}
