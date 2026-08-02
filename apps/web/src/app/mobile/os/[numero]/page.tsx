"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";

export default function ExecucaoOsPage() {
  const params = useParams<{ numero: string }>();
  const numero = Number(params.numero);
  const { pending, online, enqueue, flush } = useOfflineQueue();
  const [obs, setObs] = useState("");
  const [assinatura, setAssinatura] = useState("assinatura-demo-base64");
  const [msg, setMsg] = useState<string | null>(null);

  async function finalizar() {
    const payload = { numero, observacoes: obs, assinaturaBase64: assinatura };
    if (!online) {
      enqueue({ type: "FINALIZAR_OS", payload });
      setMsg("Finalizada — será sincronizada");
      return;
    }
    try {
      await api(`/mobile/os/${numero}/finalizar`, {
        method: "POST",
        body: JSON.stringify({ observacoes: obs, assinaturaBase64: assinatura }),
      });
      setMsg("OS finalizada");
    } catch (e) {
      enqueue({ type: "FINALIZAR_OS", payload });
      setMsg(e instanceof Error ? `${e.message} — enfileirado` : "Enfileirado");
    }
  }

  return (
    <MobileFrame title={`Executar OS #${numero}`} online={online} pending={pending} onSync={() => void flush()}>
      <div style={{ display: "grid", gap: 12 }}>
        <div style={card}>1. Checklist — (próxima sprint)</div>
        <div style={card}>2. Fotos / Peças — (próxima sprint)</div>
        <textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          placeholder="Observações finais"
          rows={3}
          style={{ ...card, resize: "vertical" }}
        />
        <input
          value={assinatura}
          onChange={(e) => setAssinatura(e.target.value)}
          placeholder="Assinatura (base64)"
          style={card}
        />
        <button
          type="button"
          onClick={() => void finalizar()}
          style={{
            border: "none",
            borderRadius: 12,
            padding: 14,
            background: "var(--nexo-primary)",
            color: "white",
            fontWeight: 800,
          }}
        >
          Finalizar atendimento
        </button>
        {msg && <div style={{ color: "var(--nexo-success)", fontWeight: 600 }}>{msg}</div>}
      </div>
    </MobileFrame>
  );
}

const card: React.CSSProperties = {
  background: "white",
  border: "1px solid var(--nexo-border)",
  borderRadius: 12,
  padding: 14,
  width: "100%",
};
