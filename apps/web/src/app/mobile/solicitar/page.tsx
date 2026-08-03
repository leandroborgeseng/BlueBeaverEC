"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";

const field: React.CSSProperties = {
  width: "100%",
  border: "1px solid oklch(0.88 0.01 250)",
  borderRadius: 12,
  padding: "12px 14px",
  background: "white",
  fontSize: 14,
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: "oklch(0.5 0.02 250)",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

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
      <p style={{ margin: "0 0 14px", color: "oklch(0.5 0.02 250)", fontSize: 13, lineHeight: 1.4 }}>
        Descreva a ocorrência. Se estiver offline, o envio fica na fila local.
      </p>
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <Label>Descrição</Label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Descreva o problema"
            rows={5}
            style={{ ...field, resize: "vertical" }}
          />
        </div>
        <div>
          <Label>Setor</Label>
          <input value={setorNome} onChange={(e) => setSetorNome(e.target.value)} placeholder="Setor" style={field} />
        </div>
        <div>
          <Label>Urgência</Label>
          <select value={urgencia} onChange={(e) => setUrgencia(e.target.value)} style={field}>
            <option value="BAIXA">Baixa</option>
            <option value="MEDIA">Média</option>
            <option value="ALTA">Alta</option>
            <option value="PARADA_CRITICA">Parada crítica</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => void enviar()}
          disabled={!descricao.trim()}
          style={{
            width: "100%",
            border: "none",
            borderRadius: 12,
            padding: 14,
            background: "oklch(0.64 0.19 38)",
            color: "white",
            fontWeight: 800,
            fontSize: 15,
            opacity: descricao.trim() ? 1 : 0.55,
            cursor: descricao.trim() ? "pointer" : "not-allowed",
          }}
        >
          Enviar solicitação
        </button>
        {msg && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: "oklch(0.94 0.05 150)",
              color: "oklch(0.35 0.1 145)",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {msg}
          </div>
        )}
      </div>
    </MobileFrame>
  );
}
