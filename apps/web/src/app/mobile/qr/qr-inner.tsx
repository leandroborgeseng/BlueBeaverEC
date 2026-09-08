"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";

interface OsAberta {
  numero: number;
  codigo: string;
  status: string;
  prioridade: string;
}

interface QrResult {
  equipamento: {
    tag: string;
    nome: string;
    situacao?: string;
    setor?: { nome: string } | null;
  };
  osAbertas: OsAberta[];
}

export default function MobileQrInner() {
  const sp = useSearchParams();
  const [codigo, setCodigo] = useState(sp.get("codigo") ?? "");
  const [result, setResult] = useState<QrResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { pending, online, flush } = useOfflineQueue();

  useEffect(() => {
    const initial = sp.get("codigo");
    if (initial) {
      setCodigo(initial);
      void ler(initial);
    }
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }

  async function ler(value = codigo) {
    const code = value.trim();
    if (!code) return;
    setErro(null);
    try {
      const data = await api<QrResult>(`/mobile/equipamento/qr/${encodeURIComponent(code)}`);
      setResult(data);
    } catch (e) {
      setResult(null);
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  async function startCamera() {
    setErro(null);
    const Detector = (
      window as unknown as {
        BarcodeDetector?: new (o: { formats: string[] }) => {
          detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
        };
      }
    ).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setErro("Câmera/QR não disponível neste navegador — digite a TAG.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      await new Promise((r) => setTimeout(r, 50));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new Detector({ formats: ["qr_code"] });
      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes[0]?.rawValue) {
            const value = codes[0].rawValue.trim();
            setCodigo(value);
            stopCamera();
            await ler(value);
            return;
          }
        } catch {
          /* ignore frame errors */
        }
        if (streamRef.current) requestAnimationFrame(() => void tick());
      };
      requestAnimationFrame(() => void tick());
    } catch {
      setErro("Não foi possível abrir a câmera.");
      stopCamera();
    }
  }

  const eq = result?.equipamento;
  const osAbertas = result?.osAbertas ?? [];

  return (
    <MobileFrame title="Ler QR" online={online} pending={pending} onSync={() => void flush()}>
      <p style={{ color: "oklch(0.5 0.02 250)", fontSize: 13, margin: "0 0 14px", lineHeight: 1.4 }}>
        Leia o QR/TAG do equipamento para ver ficha e abrir OS em andamento
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
          onKeyDown={(e) => {
            if (e.key === "Enter") void ler();
          }}
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

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => void ler()}
          style={{
            border: "none",
            borderRadius: 12,
            padding: 14,
            background: "oklch(0.64 0.19 38)",
            color: "white",
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          Consultar
        </button>
        <button
          type="button"
          onClick={() => (scanning ? stopCamera() : void startCamera())}
          style={{
            border: "1px solid oklch(0.88 0.01 250)",
            borderRadius: 12,
            padding: 14,
            background: "white",
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          {scanning ? "Parar câmera" : "Ler câmera"}
        </button>
      </div>

      {scanning && (
        <video
          ref={videoRef}
          muted
          playsInline
          style={{
            width: "100%",
            borderRadius: 14,
            marginBottom: 14,
            background: "black",
            minHeight: 200,
            objectFit: "cover",
          }}
        />
      )}

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

      {eq && (
        <div
          style={{
            background: "white",
            border: "1px solid oklch(0.91 0.006 255)",
            borderRadius: 14,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800 }}>{eq.tag}</div>
          <div style={{ fontSize: 14, color: "oklch(0.45 0.02 250)", marginTop: 2 }}>{eq.nome}</div>
          <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 6 }}>
            {eq.setor?.nome ?? "—"} · {eq.situacao ?? "—"}
          </div>
        </div>
      )}

      {result && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
            OS abertas ({osAbertas.length})
          </div>
          {osAbertas.length === 0 ? (
            <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)", marginBottom: 10 }}>
              Nenhuma OS aberta neste equipamento.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {osAbertas.map((os) => (
                <Link
                  key={os.numero}
                  href={`/mobile/os/${os.numero}`}
                  style={{
                    display: "block",
                    background: "white",
                    border: "1px solid oklch(0.91 0.006 255)",
                    borderRadius: 12,
                    padding: 14,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>{os.codigo}</div>
                  <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                    {os.status} · {os.prioridade}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "oklch(0.55 0.14 38)" }}>
                    Abrir OS →
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </MobileFrame>
  );
}
