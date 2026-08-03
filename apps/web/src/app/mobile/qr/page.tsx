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

  const eq = ficha && typeof ficha === "object" ? (ficha as Record<string, unknown>) : null;
  const tag = eq && typeof eq.tag === "string" ? eq.tag : null;
  const nome = eq && typeof eq.nome === "string" ? eq.nome : null;
  const status = eq && typeof eq.status === "string" ? eq.status : null;

  return (
    <MobileFrame title="Ler QR" online={online} pending={pending} onSync={() => void flush()}>
      <p style={{ color: "oklch(0.5 0.02 250)", fontSize: 13, margin: "0 0 14px", lineHeight: 1.4 }}>
        Simula leitura da etiqueta → ficha do equipamento
      </p>

      <div style={{ marginBottom: 10 }}>
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
          Código / TAG
        </div>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          style={{
            width: "100%",
            border: "1px solid oklch(0.88 0.01 250)",
            borderRadius: 12,
            padding: "12px 14px",
            background: "white",
            fontSize: 15,
            fontWeight: 700,
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => void ler()}
        style={{
          width: "100%",
          border: "none",
          borderRadius: 12,
          padding: 14,
          background: "oklch(0.64 0.19 38)",
          color: "white",
          fontWeight: 800,
          marginBottom: 14,
          fontSize: 15,
        }}
      >
        Consultar ficha
      </button>

      {erro && (
        <div
          style={{
            marginBottom: 12,
            padding: "12px 14px",
            borderRadius: 12,
            background: "oklch(0.96 0.03 25)",
            color: "oklch(0.45 0.15 25)",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {erro}
        </div>
      )}

      {ficha && (
        <div
          style={{
            background: "white",
            border: "1px solid oklch(0.91 0.006 255)",
            borderRadius: 14,
            padding: 16,
            boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
          }}
        >
          {(tag || nome) && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{tag ?? "Equipamento"}</div>
              {nome && <div style={{ fontSize: 14, color: "oklch(0.45 0.02 250)", marginTop: 2 }}>{nome}</div>}
              {status && (
                <div
                  style={{
                    display: "inline-block",
                    marginTop: 8,
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: "oklch(0.94 0.05 150)",
                    color: "oklch(0.4 0.12 150)",
                  }}
                >
                  {status}
                </div>
              )}
            </div>
          )}
          <pre
            style={{
              margin: 0,
              fontSize: 11,
              overflow: "auto",
              maxHeight: 320,
              color: "oklch(0.35 0.02 250)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {JSON.stringify(ficha, null, 2)}
          </pre>
        </div>
      )}
    </MobileFrame>
  );
}
