"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useMobilePersona, useSession } from "@/lib/session";
import { IconCheck } from "@/components/mobile/icons";
import {
  Banner,
  EmptyState,
  FieldLabel,
  GhostButton,
  PageTitle,
  PrimaryButton,
  cardStyle,
  fieldStyle,
} from "@/components/mobile/ui";

const URGENCIAS = [
  { id: "BAIXA", label: "Baixa" },
  { id: "MEDIA", label: "Média" },
  { id: "ALTA", label: "Alta" },
  { id: "PARADA_CRITICA", label: "Crítica" },
] as const;

function MobileSolicitarInner() {
  const sp = useSearchParams();
  const me = useSession();
  const { canSolicitar } = useMobilePersona();
  const { pending, online, enqueue, flush } = useOfflineQueue();
  const [setores, setSetores] = useState<Array<{ id: string; nome: string }>>(me?.setores ?? []);
  const [descricao, setDescricao] = useState("");
  const [setorNome, setSetorNome] = useState(me?.setores?.[0]?.nome ?? "");
  const [urgencia, setUrgencia] = useState<(typeof URGENCIAS)[number]["id"]>("MEDIA");
  const [tag, setTag] = useState(sp.get("tag") ?? "");
  const [ramal, setRamal] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [protocolo, setProtocolo] = useState<string | null>(null);
  const [osCodigo, setOsCodigo] = useState<string | null>(null);

  useEffect(() => {
    if (me?.setores?.length) {
      setSetores(me.setores);
      setSetorNome((cur) => (me.setores!.some((s) => s.nome === cur) ? cur : me.setores![0].nome));
    } else {
      setSetores([]);
      setSetorNome("");
    }
  }, [me?.setores]);

  useEffect(() => {
    const fromQr = sp.get("tag");
    if (fromQr) {
      setTag(fromQr);
      api<{ equipamento: { setor?: { nome: string } | null } }>(
        `/portal/equipamento/${encodeURIComponent(fromQr)}`,
      )
        .then((d) => {
          const nome = d.equipamento.setor?.nome;
          if (nome && (me?.setores ?? []).some((s) => s.nome === nome)) setSetorNome(nome);
        })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enviar() {
    if (!descricao.trim() || !setorNome.trim()) return;
    setBusy(true);
    setErro(null);
    const payload = {
      descricao: descricao.trim(),
      setorNome: setorNome.trim(),
      urgencia,
      equipamentoTag: tag.trim() || undefined,
      ramal: ramal.trim() || undefined,
    };
    if (!online) {
      await enqueue({ type: "SOLICITACAO", payload });
      setProtocolo("FILA-OFFLINE");
      setOsCodigo(null);
      setBusy(false);
      return;
    }
    try {
      const res = await api<{ protocolo: string; ordemServico?: { codigo?: string | null } | null }>(
        "/solicitacoes",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      setProtocolo(res.protocolo);
      setOsCodigo(res.ordemServico?.codigo ?? null);
      setDescricao("");
    } catch (e) {
      await enqueue({ type: "SOLICITACAO", payload });
      setErro(e instanceof Error ? `${e.message} — ficou na fila local` : "Enfileirada");
      setProtocolo("FILA-OFFLINE");
      setOsCodigo(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <MobileFrame title="Nova solicitação" online={online} pending={pending} onSync={() => void flush()}>
      {!canSolicitar ? (
        <EmptyState title="Sem permissão para abrir OS" hint="Peça ao engenheiro para liberar o portal do solicitante." />
      ) : (
        <>
      <PageTitle
        title="Nova ordem de serviço"
        subtitle="A engenharia clínica recebe o chamado e inicia o atendimento."
      />

      {protocolo ? (
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
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
            {protocolo === "FILA-OFFLINE" ? "Pedido na fila" : "OS aberta"}
          </div>
          <div style={{ fontSize: 13, color: "oklch(0.45 0.02 250)", marginBottom: 16, lineHeight: 1.4 }}>
            {protocolo === "FILA-OFFLINE"
              ? "Sem conexão. O chamado será enviado ao reconectar."
              : osCodigo
                ? `${osCodigo} · Pedido ${protocolo}. A engenharia clínica já recebeu o chamado.`
                : `Pedido ${protocolo}. A engenharia clínica já recebeu o chamado.`}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <PrimaryButton href="/mobile/pedidos">Ver OS do setor</PrimaryButton>
            <GhostButton
              onClick={() => {
                setProtocolo(null);
                setOsCodigo(null);
                setErro(null);
              }}
            >
              Abrir outro chamado
            </GhostButton>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          <div>
            <FieldLabel>O que aconteceu</FieldLabel>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: monitor sem traçado, alarme contínuo…"
              rows={5}
              style={{ ...fieldStyle, resize: "vertical", fontWeight: 550, lineHeight: 1.45 }}
            />
          </div>
          <div>
            <FieldLabel>Setor</FieldLabel>
            {setores.length > 0 ? (
              <select value={setorNome} onChange={(e) => setSetorNome(e.target.value)} style={fieldStyle}>
                {setores.map((s) => (
                  <option key={s.id} value={s.nome}>
                    {s.nome}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: 13, color: "oklch(0.5 0.14 25)", fontWeight: 650 }}>
                Seu usuário não está vinculado a um setor. Peça à engenharia clínica.
              </div>
            )}
          </div>
          <div>
            <FieldLabel>TAG do equipamento (opcional)</FieldLabel>
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Leia o QR ou digite a TAG"
              style={fieldStyle}
            />
            <Link
              href="/mobile/qr"
              style={{ display: "inline-block", marginTop: 8, fontSize: 12.5, fontWeight: 700, color: "var(--aion-link)" }}
            >
              Ler QR para preencher →
            </Link>
          </div>
          <div>
            <FieldLabel>Urgência</FieldLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {URGENCIAS.map((u) => {
                const active = urgencia === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setUrgencia(u.id)}
                    style={{
                      padding: "10px 4px",
                      borderRadius: 10,
                      border: `1px solid ${active ? "oklch(0.55 0.16 38)" : "var(--aion-border-soft)"}`,
                      background: active ? "oklch(0.96 0.04 55)" : "white",
                      color: active ? "oklch(0.45 0.14 38)" : "oklch(0.4 0.02 250)",
                      fontWeight: 800,
                      fontSize: 11.5,
                    }}
                  >
                    {u.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <FieldLabel>Ramal</FieldLabel>
            <input
              value={ramal}
              onChange={(e) => setRamal(e.target.value)}
              placeholder="Para retorno da engenharia"
              inputMode="tel"
              style={fieldStyle}
            />
          </div>
          {erro && <Banner tone="danger">{erro}</Banner>}
          <PrimaryButton disabled={!descricao.trim() || !setorNome.trim() || busy} onClick={() => void enviar()}>
            {busy ? "Enviando…" : "Enviar solicitação"}
          </PrimaryButton>
        </div>
      )}
        </>
      )}
    </MobileFrame>
  );
}

export default function MobileSolicitarPage() {
  return (
    <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: "oklch(0.5 0.02 250)" }}>Carregando…</div>}>
      <MobileSolicitarInner />
    </Suspense>
  );
}
