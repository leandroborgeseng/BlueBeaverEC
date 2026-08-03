"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";

const CHECKLIST_DEFAULT = [
  { id: "1", label: "Identifiquei o equipamento e conferi a TAG", ok: false },
  { id: "2", label: "Verifiquei segurança elétrica / isolamento", ok: false },
  { id: "3", label: "Executei o procedimento conforme POP", ok: false },
  { id: "4", label: "Testei funcionamento pós-intervenção", ok: false },
  { id: "5", label: "Área limpa e equipamento liberado", ok: false },
];

export default function ExecucaoOsPage() {
  const params = useParams<{ numero: string }>();
  const numero = Number(params.numero);
  const { pending, online, enqueue, flush } = useOfflineQueue();
  const [step, setStep] = useState(1);
  const [checklist, setChecklist] = useState(CHECKLIST_DEFAULT);
  const [fotos, setFotos] = useState<Array<{ dataUrl: string; legenda?: string }>>([]);
  const [itemCodigo, setItemCodigo] = useState("");
  const [qtd, setQtd] = useState("1");
  const [obs, setObs] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    api<{ checklistMobile?: { itens: typeof CHECKLIST_DEFAULT } }>(`/mobile/os/${numero}`)
      .then((d) => {
        if (d.checklistMobile?.itens?.length) setChecklist(d.checklistMobile.itens as typeof CHECKLIST_DEFAULT);
      })
      .catch(() => undefined);
  }, [numero]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
  }, [step]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function onPointerUp() {
    drawing.current = false;
  }

  function clearSign() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
  }

  async function saveChecklist() {
    const payload = { numero, itens: checklist };
    if (!online) {
      await enqueue({ type: "CHECKLIST", payload });
      setMsg("Checklist salvo — será sincronizado");
      setStep(2);
      return;
    }
    try {
      await api(`/mobile/os/${numero}/checklist`, { method: "POST", body: JSON.stringify({ itens: checklist }) });
      setMsg("Checklist salvo");
      setStep(2);
    } catch (e) {
      await enqueue({ type: "CHECKLIST", payload });
      setMsg(e instanceof Error ? `${e.message} — enfileirado` : "Enfileirado");
      setStep(2);
    }
  }

  async function onPhoto(file: File | null) {
    if (!file) return;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    setFotos((f) => [...f, { dataUrl, legenda: file.name }]);
  }

  async function saveFotosPecas() {
    if (fotos.length) {
      const payload = { numero, fotos };
      if (!online) {
        await enqueue({ type: "FOTOS", payload });
      } else {
        try {
          await api(`/mobile/os/${numero}/fotos`, { method: "POST", body: JSON.stringify({ fotos }) });
        } catch {
          await enqueue({ type: "FOTOS", payload });
        }
      }
    }
    if (itemCodigo.trim()) {
      const payload = { numero, itemCodigo: itemCodigo.trim(), qtd: Number(qtd) || 1 };
      if (!online) {
        await enqueue({ type: "PECAS", payload });
        setMsg("Peças enfileiradas — serão sincronizadas");
      } else {
        try {
          await api(`/mobile/os/${numero}/pecas`, { method: "POST", body: JSON.stringify(payload) });
          setMsg("Peças baixadas no estoque");
        } catch (e) {
          await enqueue({ type: "PECAS", payload });
          setMsg(e instanceof Error ? `${e.message} — enfileirado` : "Enfileirado");
        }
      }
    }
    setStep(3);
  }

  async function finalizar() {
    const assinaturaBase64 = canvasRef.current?.toDataURL("image/png") ?? "";
    if (!assinaturaBase64 || assinaturaBase64.length < 100) {
      setMsg("Assinatura digital obrigatória");
      return;
    }
    const payload = { numero, observacoes: obs, assinaturaBase64 };
    if (!online) {
      await enqueue({ type: "FINALIZAR_OS", payload });
      setMsg("Finalizada — será sincronizada");
      return;
    }
    try {
      await api(`/mobile/os/${numero}/finalizar`, {
        method: "POST",
        body: JSON.stringify({ observacoes: obs, assinaturaBase64 }),
      });
      setMsg("OS finalizada");
    } catch (e) {
      await enqueue({ type: "FINALIZAR_OS", payload });
      setMsg(e instanceof Error ? `${e.message} — enfileirado` : "Enfileirado");
    }
  }

  return (
    <MobileFrame title={`Executar OS #${numero}`} online={online} pending={pending} onSync={() => void flush()}>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[1, 2, 3].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s)}
            style={{
              flex: 1,
              padding: 8,
              borderRadius: 8,
              border: step === s ? "2px solid var(--aion-primary)" : "1px solid var(--aion-border)",
              background: step === s ? "oklch(0.95 0.03 250)" : "white",
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            {s === 1 ? "Checklist" : s === 2 ? "Fotos/Peças" : "Finalizar"}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div style={{ display: "grid", gap: 8 }}>
          {checklist.map((c, i) => (
            <label key={c.id} style={{ ...card, display: "flex", gap: 10, alignItems: "flex-start" }}>
              <input
                type="checkbox"
                checked={c.ok}
                onChange={(e) => {
                  const next = [...checklist];
                  next[i] = { ...c, ok: e.target.checked };
                  setChecklist(next);
                }}
              />
              <span style={{ fontSize: 14 }}>{c.label}</span>
            </label>
          ))}
          <button type="button" onClick={() => void saveChecklist()} style={primaryBtn}>
            Salvar e continuar
          </button>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: "grid", gap: 10 }}>
          <label style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Fotos</div>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {fotos.map((f, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={f.dataUrl} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8 }} />
              ))}
            </div>
          </label>
          <div style={{ ...card, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Peças (baixa estoque)</div>
            <input value={itemCodigo} onChange={(e) => setItemCodigo(e.target.value)} placeholder="Código do item" style={input} />
            <input value={qtd} onChange={(e) => setQtd(e.target.value)} type="number" min="0.01" step="0.01" placeholder="Qtd" style={input} />
          </div>
          <button type="button" onClick={() => void saveFotosPecas()} style={primaryBtn}>
            Continuar para finalizar
          </button>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: "grid", gap: 10 }}>
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observações finais" rows={3} style={{ ...card, resize: "vertical" }} />
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Assinatura do responsável do setor</div>
            <canvas
              ref={canvasRef}
              width={360}
              height={140}
              style={{ width: "100%", height: 140, border: "1px dashed var(--aion-border)", borderRadius: 8, touchAction: "none", background: "white" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
            <button type="button" onClick={clearSign} style={{ marginTop: 8, fontSize: 12 }}>Limpar</button>
          </div>
          <button type="button" onClick={() => void finalizar()} style={primaryBtn}>
            Finalizar atendimento
          </button>
        </div>
      )}

      {msg && <div style={{ marginTop: 10, color: "var(--aion-success)", fontWeight: 600 }}>{msg}</div>}
    </MobileFrame>
  );
}

const card: React.CSSProperties = {
  background: "white",
  border: "1px solid var(--aion-border)",
  borderRadius: 12,
  padding: 14,
  width: "100%",
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--aion-border)",
};
const primaryBtn: React.CSSProperties = {
  border: "none",
  borderRadius: 12,
  padding: 14,
  background: "var(--aion-primary)",
  color: "white",
  fontWeight: 800,
};
