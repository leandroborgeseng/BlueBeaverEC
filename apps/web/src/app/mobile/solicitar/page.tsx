"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";

export default function MobileSolicitarPage() {
  const { pending, online, enqueue, flush } = useOfflineQueue();
  const [descricao, setDescricao] = useState("");
  const [setorNome, setSetorNome] = useState("UTI Adulto");
  const [urgencia, setUrgencia] = useState("MEDIA");
  const [msg, setMsg] = useState<string | null>(null);

  async function enviar() {
    const payload = { descricao, setorNome, urgencia };
    if (!online) {
      await enqueue({ type: "SOLICITACAO", payload });
      setMsg("Offline — solicitação na fila local (será sincronizada)");
      setDescricao("");
      return;
    }
    try {
      await api("/solicitacoes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMsg("Solicitação enviada");
      setDescricao("");
    } catch (e) {
      await enqueue({ type: "SOLICITACAO", payload });
      setMsg(e instanceof Error ? `${e.message} — enfileirada` : "Enfileirada");
      setDescricao("");
    }
  }

  return (
    <MobileFrame title="Solicitar" online={online} pending={pending} onSync={() => void flush()}>
      <div style={{ display: "grid", gap: 10 }}>
        <textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descreva o problema"
          rows={5}
          style={{
            width: "100%",
            border: "1px solid var(--nexo-border)",
            borderRadius: 12,
            padding: 12,
            background: "white",
          }}
        />
        <input
          value={setorNome}
          onChange={(e) => setSetorNome(e.target.value)}
          placeholder="Setor"
          style={{
            width: "100%",
            border: "1px solid var(--nexo-border)",
            borderRadius: 12,
            padding: 12,
            background: "white",
          }}
        />
        <select
          value={urgencia}
          onChange={(e) => setUrgencia(e.target.value)}
          style={{
            width: "100%",
            border: "1px solid var(--nexo-border)",
            borderRadius: 12,
            padding: 12,
            background: "white",
          }}
        >
          <option value="BAIXA">Baixa</option>
          <option value="MEDIA">Média</option>
          <option value="ALTA">Alta</option>
          <option value="PARADA_CRITICA">Parada crítica</option>
        </select>
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={!descricao.trim()}
          style={{
            width: "100%",
            border: "none",
            borderRadius: 12,
            padding: 14,
            background: "var(--nexo-primary)",
            color: "white",
            fontWeight: 800,
          }}
        >
          Enviar
        </button>
        {msg && <p style={{ color: "var(--nexo-success)", fontWeight: 600 }}>{msg}</p>}
      </div>
    </MobileFrame>
  );
}
