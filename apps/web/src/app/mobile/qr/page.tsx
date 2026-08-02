"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";

export default function MobileQrPage() {
  const [codigo, setCodigo] = useState("EQ-0001");
  const [ficha, setFicha] = useState<Record<string, unknown> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { pending, online, flush } = useOfflineQueue();

  async function ler() {
    setErro(null);
    try {
      const data = await api<Record<string, unknown>>(`/mobile/equipamento/qr/${encodeURIComponent(codigo)}`);
      setFicha(data);
    } catch (e) {
      setFicha(null);
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <MobileFrame title="Ler QR" online={online} pending={pending} onSync={() => void flush()}>
      <p style={{ color: "var(--nexo-muted)", fontSize: 13 }}>Simula leitura da etiqueta → ficha do equipamento</p>
      <input value={codigo} onChange={(e) => setCodigo(e.target.value)} style={input} />
      <button type="button" onClick={() => void ler()} style={btn}>
        Consultar
      </button>
      {erro && <div style={{ color: "var(--nexo-danger)" }}>{erro}</div>}
      {ficha && (
        <pre
          style={{
            background: "white",
            border: "1px solid var(--nexo-border)",
            borderRadius: 12,
            padding: 12,
            fontSize: 12,
            overflow: "auto",
          }}
        >
          {JSON.stringify(ficha, null, 2)}
        </pre>
      )}
    </MobileFrame>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--nexo-border)",
  borderRadius: 12,
  padding: 12,
  marginBottom: 10,
  background: "white",
};
const btn: React.CSSProperties = {
  width: "100%",
  border: "none",
  borderRadius: 12,
  padding: 12,
  background: "var(--nexo-brand)",
  color: "white",
  fontWeight: 700,
  marginBottom: 12,
};
