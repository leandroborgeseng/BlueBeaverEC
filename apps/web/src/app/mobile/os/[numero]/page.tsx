"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useMobilePersona } from "@/lib/session";
import { IconCheck } from "@/components/mobile/icons";
import {
  Banner,
  EmptyState,
  FieldLabel,
  GhostButton,
  PrioChip,
  PrimaryButton,
  StatusChip,
  cardStyle,
  fieldStyle,
} from "@/components/mobile/ui";

type CheckItem = { id: string; label: string; ok: boolean; answered?: boolean };

const CHECKLIST_DEFAULT: CheckItem[] = [
  { id: "1", label: "Identifiquei o equipamento e conferi a TAG", ok: false },
  { id: "2", label: "Verifiquei segurança elétrica / isolamento", ok: false },
  { id: "3", label: "Executei o procedimento conforme POP", ok: false },
  { id: "4", label: "Testei funcionamento pós-intervenção", ok: false },
  { id: "5", label: "Área limpa e equipamento liberado", ok: false },
];

interface OsDetalhe {
  codigo?: string;
  tipo?: string;
  status?: string;
  prioridade?: string;
  equipamento?: { tag: string; nome: string; setor?: { nome: string } };
  checklistMobile?: { itens: CheckItem[] };
  checklistSugerido?: CheckItem[];
  fotosMobile?: Array<{ dataUrl: string }>;
}

export default function ExecucaoOsPage() {
  const params = useParams<{ numero: string }>();
  const router = useRouter();
  const numero = Number(params.numero);
  const { isEnfermeiro, isTecnico } = useMobilePersona();
  const { pending, online, enqueue, flush } = useOfflineQueue();
  const [os, setOs] = useState<OsDetalhe | null>(null);
  const [step, setStep] = useState(1);
  const [checklist, setChecklist] = useState<CheckItem[]>(CHECKLIST_DEFAULT);
  const [fotos, setFotos] = useState<Array<{ dataUrl: string; legenda?: string }>>([]);
  const [itemCodigo, setItemCodigo] = useState("");
  const [qtd, setQtd] = useState("1");
  const [obs, setObs] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (isEnfermeiro) {
      router.replace("/mobile/pedidos");
      return;
    }
    api<OsDetalhe>(`/mobile/os/${numero}`)
      .then((d) => {
        setOs(d);
        if (d.checklistMobile?.itens?.length) {
          setChecklist(d.checklistMobile.itens.map((i) => ({ ...i, answered: true })));
        } else if (d.checklistSugerido?.length) {
          setChecklist(d.checklistSugerido.map((i) => ({ ...i, answered: false })));
        }
        if (d.fotosMobile?.length) {
          setFotos(d.fotosMobile.map((f) => ({ dataUrl: f.dataUrl })));
        }
      })
      .catch(() => undefined);
  }, [numero, isEnfermeiro, router]);

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
    e.currentTarget.setPointerCapture(e.pointerId);
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
    const payload = { numero, itens: checklist.map(({ id, label, ok }) => ({ id, label, ok })) };
    if (!online) {
      await enqueue({ type: "CHECKLIST", payload });
      setMsg("Checklist salvo — será sincronizado");
      setStep(2);
      return;
    }
    try {
      await api(`/mobile/os/${numero}/checklist`, { method: "POST", body: JSON.stringify({ itens: payload.itens }) });
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
      setDone(true);
      setMsg("Finalizada — será sincronizada");
      return;
    }
    try {
      await api(`/mobile/os/${numero}/finalizar`, {
        method: "POST",
        body: JSON.stringify({ observacoes: obs, assinaturaBase64 }),
      });
      setDone(true);
      setMsg("OS finalizada");
    } catch (e) {
      await enqueue({ type: "FINALIZAR_OS", payload });
      setDone(true);
      setMsg(e instanceof Error ? `${e.message} — enfileirado` : "Enfileirado");
    }
  }

  const respondidas = checklist.filter((c) => c.answered).length;
  const steps = [
    { id: 1, label: "Checklist" },
    { id: 2, label: "Fotos/Peças" },
    { id: 3, label: "Finalizar" },
  ];

  if (!isTecnico && !isEnfermeiro) {
    return (
      <MobileFrame title="OS" online={online} pending={pending}>
        <EmptyState title="Sem permissão" />
      </MobileFrame>
    );
  }

  return (
    <MobileFrame title={`Executar OS #${numero}`} online={online} pending={pending} onSync={() => void flush()}>
      <Link href="/mobile/os" style={{ fontSize: 13, fontWeight: 600, color: "var(--aion-link)", textDecoration: "none" }}>
        ‹ Minhas OS
      </Link>

      <div style={{ ...cardStyle, margin: "12px 0 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.25 }}>
            {os?.equipamento?.nome || os?.equipamento?.tag || `OS #${numero}`}
          </div>
          {os?.prioridade && <PrioChip value={os.prioridade} />}
        </div>
        <div style={{ fontSize: 12.5, color: "oklch(0.5 0.02 250)" }}>
          {os?.codigo ?? `OS-${numero}`}
          {os?.equipamento?.setor?.nome ? ` · ${os.equipamento.setor.nome}` : ""}
          {os?.tipo ? ` · ${os.tipo}` : ""}
        </div>
        {os?.status && (
          <div style={{ marginTop: 8 }}>
            <StatusChip value={os.status} />
          </div>
        )}
      </div>

      {done ? (
        <div style={{ ...cardStyle, textAlign: "center", padding: 28 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: "oklch(0.94 0.05 150)",
              margin: "0 auto 14px",
              display: "grid",
              placeItems: "center",
            }}
          >
            <IconCheck size={24} color="oklch(0.4 0.13 150)" stroke={2.6} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Atendimento encerrado</div>
          <div style={{ fontSize: 13, color: "oklch(0.45 0.02 250)", marginBottom: 16 }}>{msg}</div>
          <PrimaryButton href="/mobile/os">Voltar para a fila</PrimaryButton>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {steps.map((s) => (
              <div
                key={s.id}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 4,
                  background: step >= s.id ? "var(--aion-primary)" : "oklch(0.9 0.01 250)",
                }}
                title={s.label}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {steps.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStep(s.id)}
                style={{
                  flex: 1,
                  padding: 8,
                  borderRadius: 8,
                  border: step === s.id ? "2px solid var(--aion-primary)" : "1px solid var(--aion-border)",
                  background: step === s.id ? "oklch(0.97 0.02 55)" : "white",
                  fontWeight: 700,
                  fontSize: 12,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {step === 1 && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 12.5, color: "oklch(0.5 0.02 250)", fontWeight: 600 }}>
                {respondidas} de {checklist.length} itens respondidos
              </div>
              {checklist.map((c, i) => (
                <div key={c.id} style={cardStyle}>
                  <div style={{ fontSize: 14, fontWeight: 650, marginBottom: 10, lineHeight: 1.35 }}>{c.label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {(["sim", "nao"] as const).map((opt) => {
                      const on = c.answered && ((opt === "sim" && c.ok) || (opt === "nao" && !c.ok));
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            const next = [...checklist];
                            next[i] = { ...c, ok: opt === "sim", answered: true };
                            setChecklist(next);
                          }}
                          style={{
                            padding: 10,
                            borderRadius: 10,
                            border: `1px solid ${on ? "oklch(0.55 0.16 255)" : "oklch(0.88 0.008 255)"}`,
                            background: on ? "oklch(0.55 0.16 255)" : "white",
                            color: on ? "white" : "oklch(0.4 0.02 250)",
                            fontWeight: 800,
                            fontSize: 13,
                          }}
                        >
                          {opt === "sim" ? "Sim" : "Não"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <PrimaryButton onClick={() => void saveChecklist()}>Salvar e continuar</PrimaryButton>
            </div>
          )}

          {step === 2 && (
            <div style={{ display: "grid", gap: 12 }}>
              <div style={cardStyle}>
                <FieldLabel>Fotos</FieldLabel>
                <label
                  style={{
                    display: "grid",
                    placeItems: "center",
                    border: "1px dashed var(--aion-border)",
                    borderRadius: 12,
                    padding: 18,
                    background: "oklch(0.98 0.003 250)",
                    cursor: "pointer",
                    fontWeight: 700,
                    fontSize: 13,
                    color: "var(--aion-brand)",
                  }}
                >
                  Adicionar foto da câmera
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)}
                    style={{ display: "none" }}
                  />
                </label>
                {fotos.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
                    {fotos.map((f, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={f.dataUrl}
                        alt=""
                        style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10 }}
                      />
                    ))}
                  </div>
                )}
              </div>
              <div style={{ ...cardStyle, display: "grid", gap: 8 }}>
                <FieldLabel>Peças (baixa estoque)</FieldLabel>
                <input value={itemCodigo} onChange={(e) => setItemCodigo(e.target.value)} placeholder="Código do item" style={fieldStyle} />
                <input value={qtd} onChange={(e) => setQtd(e.target.value)} type="number" min="0.01" step="0.01" placeholder="Qtd" style={fieldStyle} />
              </div>
              <PrimaryButton onClick={() => void saveFotosPecas()}>Continuar para finalizar</PrimaryButton>
            </div>
          )}

          {step === 3 && (
            <div style={{ display: "grid", gap: 12 }}>
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Observações finais do atendimento"
                rows={3}
                style={{ ...fieldStyle, resize: "vertical" }}
              />
              <div style={cardStyle}>
                <FieldLabel>Assinatura do responsável do setor</FieldLabel>
                <canvas
                  ref={canvasRef}
                  width={360}
                  height={140}
                  style={{
                    width: "100%",
                    height: 140,
                    border: "1px dashed var(--aion-border)",
                    borderRadius: 8,
                    touchAction: "none",
                    background: "white",
                  }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerLeave={onPointerUp}
                />
                <div style={{ marginTop: 8 }}>
                  <GhostButton onClick={clearSign}>Limpar assinatura</GhostButton>
                </div>
              </div>
              <PrimaryButton onClick={() => void finalizar()}>Finalizar atendimento</PrimaryButton>
            </div>
          )}

          {msg && !done && (
            <div style={{ marginTop: 12 }}>
              <Banner tone={msg.toLowerCase().includes("obrigat") ? "danger" : "success"}>{msg}</Banner>
            </div>
          )}
        </>
      )}
    </MobileFrame>
  );
}
