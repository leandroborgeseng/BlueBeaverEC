"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useMobilePersona } from "@/lib/session";
import { IconQr } from "@/components/mobile/icons";
import {
  Banner,
  FieldLabel,
  GhostButton,
  PageTitle,
  PrioChip,
  PrimaryButton,
  StatusChip,
  cardStyle,
  fieldStyle,
} from "@/components/mobile/ui";

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
    patrimonio?: string | null;
    setor?: { nome: string } | null;
    fabricante?: { nome: string } | null;
    modelo?: { nome: string } | null;
  };
  osAbertas: OsAberta[];
}

export default function MobileQrInner() {
  const sp = useSearchParams();
  const { canSolicitar, isTecnico } = useMobilePersona();
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
      setErro("Câmera/QR não disponível neste navegador — digite a TAG do equipamento.");
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
      setErro("Não foi possível abrir a câmera. Permita o acesso ou digite a TAG.");
      stopCamera();
    }
  }

  const eq = result?.equipamento;
  const osAbertas = result?.osAbertas ?? [];
  const fabMod = [eq?.fabricante?.nome, eq?.modelo?.nome].filter(Boolean).join(" · ");

  return (
    <MobileFrame title="Ler QR" online={online} pending={pending} onSync={() => void flush()}>
      <PageTitle
        title={isTecnico ? "Identificar equipamento" : "Ficha do equipamento"}
        subtitle={
          isTecnico
            ? "QR code ou TAG para ver ficha, OS abertas e inventário"
            : "Leia o QR ou informe a TAG para abrir o chamado."
        }
      />

      <div style={{ marginBottom: 10 }}>
        <FieldLabel>Código / TAG</FieldLabel>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void ler();
          }}
          placeholder="EQ-0001"
          style={{ ...fieldStyle, fontWeight: 700 }}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        <PrimaryButton onClick={() => void ler()}>Consultar</PrimaryButton>
        <GhostButton onClick={() => (scanning ? stopCamera() : void startCamera())}>
          {scanning ? "Parar câmera" : "Ler câmera"}
        </GhostButton>
      </div>

      {scanning && (
        <div
          style={{
            position: "relative",
            borderRadius: 16,
            overflow: "hidden",
            marginBottom: 14,
            background: "black",
            minHeight: 240,
          }}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ width: "100%", minHeight: 240, objectFit: "cover", display: "block" }}
          />
          <div
            style={{
              position: "absolute",
              inset: 28,
              border: "2px solid rgba(255,255,255,0.85)",
              borderRadius: 12,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 36,
              right: 36,
              height: 2,
              background: "oklch(0.64 0.19 38)",
              animation: "scan-line 2.2s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: 0,
              right: 0,
              textAlign: "center",
              color: "white",
              fontSize: 12,
              fontWeight: 700,
              textShadow: "0 1px 4px rgba(0,0,0,.6)",
            }}
          >
            Alinhe o QR na moldura
          </div>
        </div>
      )}

      {erro && (
        <div style={{ marginBottom: 12 }}>
          <Banner tone="danger">{erro}</Banner>
        </div>
      )}

      {eq && (
        <div style={{ ...cardStyle, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "oklch(0.95 0.02 255)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <IconQr size={22} color="oklch(0.45 0.14 255)" />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{eq.tag}</div>
              <div style={{ fontSize: 14, color: "oklch(0.45 0.02 250)", marginTop: 2 }}>{eq.nome}</div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14, fontSize: 12.5 }}>
            <div>
              <div style={{ color: "oklch(0.55 0.02 250)", fontWeight: 700 }}>Setor</div>
              <div style={{ fontWeight: 700 }}>{eq.setor?.nome ?? "—"}</div>
            </div>
            <div>
              <div style={{ color: "oklch(0.55 0.02 250)", fontWeight: 700 }}>Situação</div>
              <div style={{ fontWeight: 700 }}>{eq.situacao ?? "—"}</div>
            </div>
            <div>
              <div style={{ color: "oklch(0.55 0.02 250)", fontWeight: 700 }}>Fabricante</div>
              <div style={{ fontWeight: 700 }}>{fabMod || "—"}</div>
            </div>
            <div>
              <div style={{ color: "oklch(0.55 0.02 250)", fontWeight: 700 }}>Patrimônio</div>
              <div style={{ fontWeight: 700 }}>{eq.patrimonio || "—"}</div>
            </div>
          </div>
        </div>
      )}

      {result && canSolicitar && (
        <div style={{ marginBottom: 14 }}>
          <PrimaryButton href={`/mobile/solicitar?tag=${encodeURIComponent(eq?.tag ?? codigo)}`}>
            Abrir OS deste equipamento
          </PrimaryButton>
        </div>
      )}

      {result && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>OS abertas ({osAbertas.length})</div>
          {osAbertas.length === 0 ? (
            <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)", marginBottom: 10 }}>
              Nenhuma OS aberta neste equipamento.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {osAbertas.map((os) => (
                <Link
                  key={os.numero}
                  href={isTecnico ? `/mobile/os/${os.numero}` : "/mobile/pedidos"}
                  style={{ ...cardStyle, display: "block", textDecoration: "none", color: "inherit" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontWeight: 800 }}>{os.codigo}</div>
                    <PrioChip value={os.prioridade} />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <StatusChip value={os.status} />
                  </div>
                  {isTecnico && (
                    <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: "oklch(0.55 0.14 38)" }}>
                      Abrir OS →
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </MobileFrame>
  );
}
