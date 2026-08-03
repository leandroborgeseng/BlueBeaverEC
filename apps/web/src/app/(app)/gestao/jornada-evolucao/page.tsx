"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge, PageHeader, Surface } from "@/components/ui/aion-ui";

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
      <PageHeader title="Jornada de Evolução" subtitle="Navegação livre entre etapas — sem gate de aprovação" />
      {msg && <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600 }}>{msg}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {etapas.map((e, i) => (
          <button
            key={e}
            type="button"
            onClick={() => void ir(e)}
            style={{
              padding: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
            }}
          >
            <Badge tone={e === etapa ? "ATIVO" : "INATIVO"}>
              {i + 1}. {LABELS[e] ?? e}
            </Badge>
          </button>
        ))}
      </div>
      <Surface>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>{LABELS[etapa]}</h2>
        <p style={{ fontSize: 13, color: "oklch(0.5 0.02 250)", margin: 0 }}>
          Registre entregáveis, evidências e indicadores desta etapa na Avaliação de Maturidade e na Central de Conformidade.
        </p>
      </Surface>
    </div>
  );
}
