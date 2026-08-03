"use client";

import { useEffect, useState } from "react";
import { useWindowStore } from "@/store/windows";
import { Btn, PageHeader, Surface, fieldStyle, FieldLabel } from "@/components/ui/aion-ui";

/**
 * Fluxo legado unificado: abre o LaudoEditor (com U/metrologia) em janela flutuante.
 */
export default function NovoLaudoPage() {
  const openWindow = useWindowStore((s) => s.open);
  const [tipo, setTipo] = useState("PREVENTIVA");
  const [tag, setTag] = useState("");

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("tipo");
    const tagQ = sp.get("tag");
    if (t) setTipo(t);
    if (tagQ) setTag(tagQ);
    if (sp.get("auto") === "1") {
      openWindow({
        kind: "laudo",
        title: `Novo Laudo · ${t ?? "PREVENTIVA"}`,
        payload: {
          tipo: t ?? "PREVENTIVA",
          ...(tagQ ? { equipamentoTag: tagQ } : {}),
        },
      });
      window.history.replaceState({}, "", "/laudos");
    }
  }, [openWindow]);

  function abrir() {
    openWindow({
      kind: "laudo",
      title: `Novo Laudo · ${tipo}`,
      payload: {
        tipo,
        ...(tag.trim() ? { equipamentoTag: tag.trim() } : {}),
      },
    });
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <PageHeader
        title="Novo Laudo"
        subtitle="Abre o editor completo (checklist, calibração com U, TSE, qualificação)"
        actions={
          <Btn href="/laudos" variant="ghost">
            Ver laudos
          </Btn>
        }
      />
      <Surface style={{ display: "grid", gap: 12 }}>
        <div>
          <FieldLabel>Tipo</FieldLabel>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={fieldStyle}>
            <option value="RECEBIMENTO">Recebimento</option>
            <option value="PREVENTIVA">Preventiva</option>
            <option value="CALIBRACAO">Calibração</option>
            <option value="TSE">TSE</option>
            <option value="QUALIFICACAO">Qualificação</option>
          </select>
        </div>
        <div>
          <FieldLabel>TAG do equipamento (opcional)</FieldLabel>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Ex.: EQ-0001"
            style={fieldStyle}
          />
        </div>
        <Btn onClick={abrir}>Abrir editor de laudo</Btn>
      </Surface>
    </div>
  );
}
