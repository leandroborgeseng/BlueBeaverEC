"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const LABELS: Record<string, string> = {
  DIAGNOSTICO: "Diagnóstico",
  PRIORIZACAO: "Priorização",
  PLANO: "Plano",
  IMPLANTACAO: "Implantação",
  EVIDENCIAS: "Evidências",
  AVALIACAO: "Avaliação",
  MELHORIA_CONTINUA: "Melhoria Contínua",
};

export default function JornadaPage() {
  const [etapa, setEtapa] = useState<string>("DIAGNOSTICO");
  const [etapas, setEtapas] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<{ etapaAtual: string; etapas: string[] }>("/estrategico/jornada")
      .then((j) => {
        setEtapa(j.etapaAtual);
        setEtapas(j.etapas);
      })
      .catch((e) => setMsg(e.message));
  }, []);

  async function ir(e: string) {
    await api("/estrategico/jornada", { method: "PATCH", body: JSON.stringify({ etapaAtual: e }) });
    setEtapa(e);
    setMsg(`Etapa: ${LABELS[e] ?? e} (navegação livre)`);
  }

  return (
    <div>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Jornada de Evolução</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Navegação livre entre etapas — sem gate de aprovação
      </p>
      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {etapas.map((e, i) => (
          <button
            key={e}
            type="button"
            onClick={() => void ir(e)}
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              border: e === etapa ? "2px solid var(--nexo-brand)" : "1px solid var(--nexo-border)",
              background: e === etapa ? "oklch(0.95 0.03 145)" : "var(--nexo-surface)",
              fontWeight: e === etapa ? 800 : 500,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {i + 1}. {LABELS[e] ?? e}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 20, padding: 16, borderRadius: 12, border: "1px solid var(--nexo-border)", background: "var(--nexo-surface)" }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>{LABELS[etapa]}</h2>
        <p style={{ fontSize: 13, color: "var(--nexo-muted)", margin: 0 }}>
          Registre entregáveis, evidências e indicadores desta etapa na Avaliação de Maturidade e na Central de Conformidade.
        </p>
      </div>
    </div>
  );
}
