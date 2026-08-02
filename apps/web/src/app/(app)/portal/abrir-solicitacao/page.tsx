"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/api";

export default function AbrirSolicitacaoPage() {
  const [ok, setOk] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setOk(null);
    // Endpoint completo de solicitações entra na sequência da Fase 1; placeholder de UX.
    try {
      await api("/session/me");
      setOk("Fluxo de solicitação preparado — API POST /solicitacoes na próxima entrega da Fase 1.");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    }
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, fontWeight: 800 }}>Abrir Solicitação</h1>
      <p style={{ margin: "0 0 16px", color: "var(--nexo-muted)", fontSize: 13 }}>
        Portal do solicitante — filtrado pelo setor do usuário
      </p>
      <form
        onSubmit={onSubmit}
        style={{
          background: "var(--nexo-surface)",
          border: "1px solid var(--nexo-border)",
          borderRadius: 12,
          padding: 18,
          display: "grid",
          gap: 12,
        }}
      >
        <input placeholder="TAG do equipamento (opcional)" style={input} />
        <textarea placeholder="Descrição do problema" rows={4} style={{ ...input, resize: "vertical" }} required />
        <select style={input} defaultValue="MEDIA">
          <option value="BAIXA">Urgência: Baixa</option>
          <option value="MEDIA">Urgência: Média</option>
          <option value="ALTA">Urgência: Alta</option>
          <option value="PARADA_CRITICA">Parada de Equipamento Crítico</option>
        </select>
        <button type="submit" style={btn}>
          Enviar solicitação
        </button>
        {ok && <div style={{ color: "var(--nexo-success)", fontSize: 13 }}>{ok}</div>}
        {erro && <div style={{ color: "var(--nexo-danger)", fontSize: 13 }}>{erro}</div>}
      </form>
    </div>
  );
}

const input: React.CSSProperties = {
  border: "1px solid var(--nexo-border)",
  borderRadius: 10,
  padding: "10px 12px",
  width: "100%",
};
const btn: React.CSSProperties = {
  border: "none",
  borderRadius: 10,
  padding: "11px 14px",
  background: "var(--nexo-primary)",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};
