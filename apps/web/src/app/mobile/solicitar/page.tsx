"use client";

import { useState } from "react";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";

export default function MobileSolicitarPage() {
  const { pending, online, enqueue, flush } = useOfflineQueue();
  const [descricao, setDescricao] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function enviar() {
    enqueue({
      type: "SOLICITACAO",
      payload: { descricao, createdAt: new Date().toISOString() },
    });
    setMsg(online ? "Solicitação enfileirada para sync (API completa na Fase 1)" : "Offline — na fila local");
    setDescricao("");
  }

  return (
    <MobileFrame title="Solicitar" online={online} pending={pending} onSync={() => void flush()}>
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
          marginBottom: 10,
        }}
      />
      <button
        type="button"
        onClick={enviar}
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
      {msg && <p style={{ color: "var(--nexo-success)" }}>{msg}</p>}
    </MobileFrame>
  );
}
