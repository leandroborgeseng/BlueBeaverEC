"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCampoCache } from "@/lib/mobile-cache";
import { labelDiasAberta } from "@/lib/mobile-ficha";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useMobilePersona } from "@/lib/session";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { EmptyState, FilterPills, PageTitle, PrimaryButton, StatusChip, cardStyle } from "@/components/mobile/ui";

export default function MobileSyncPage() {
  const { isTecnico } = useMobilePersona();
  const { pending, online, flush, queue } = useOfflineQueue();
  const { os, equipamentos, lastPullAt, pulling, pull, hydrate, lastPullMsg } = useCampoCache();
  const [aba, setAba] = useState<"OS" | "EQUIPAMENTOS">("OS");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  async function enviar() {
    setBusy(true);
    setMsg(null);
    try {
      const n = await flush();
      setMsg(n === 0 ? "Nada na fila de envio" : `${n} ação(ões) enviada(s)`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao enviar");
    } finally {
      setBusy(false);
    }
  }

  async function baixar() {
    setBusy(true);
    setMsg(null);
    try {
      await pull(isTecnico);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha ao baixar");
    } finally {
      setBusy(false);
    }
  }

  const quando = lastPullAt
    ? new Date(lastPullAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "ainda não baixou";

  return (
    <MobileFrame title="Sincronização" online={online} pending={pending} onSync={() => void flush()}>
      <PageTitle
        title="Sincronização"
        subtitle={`${quando} · ${os.length} OS e ${equipamentos.length} equipamento(s) no aparelho`}
      />

      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <PrimaryButton disabled={busy || pulling} onClick={() => void baixar()}>
          {pulling ? "Baixando…" : "Baixar OS e equipamentos"}
        </PrimaryButton>
        <button
          type="button"
          disabled={busy || pending === 0}
          onClick={() => void enviar()}
          style={{
            width: "100%",
            border: "1px solid var(--aion-border-soft)",
            borderRadius: 12,
            padding: 14,
            background: "white",
            fontWeight: 800,
            fontSize: 14,
            opacity: pending === 0 ? 0.5 : 1,
          }}
        >
          Enviar fila ({pending})
        </button>
      </div>

      {(msg || lastPullMsg) && (
        <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 12, color: "oklch(0.4 0.12 150)" }}>
          {msg || lastPullMsg}
        </div>
      )}

      {queue.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Ações pendentes de envio</div>
          {queue.slice(0, 8).map((q) => (
            <div key={q.clientId} style={{ fontSize: 12.5, color: "oklch(0.45 0.02 250)", marginTop: 4 }}>
              {q.type}
            </div>
          ))}
        </div>
      )}

      <FilterPills
        value={aba}
        onChange={setAba}
        options={[
          { id: "OS", label: "OS", count: os.length },
          { id: "EQUIPAMENTOS", label: "Equipamentos", count: equipamentos.length },
        ]}
      />

      {aba === "OS" ? (
        os.length === 0 ? (
          <EmptyState
            title="Nenhum registro encontrado!"
            hint="Toque em Baixar para guardar no aparelho as OS da sua fila (técnico) ou do seu setor (enfermagem)."
          />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {os.map((o) => (
              <Link
                key={o.id || o.numero}
                href={isTecnico ? `/mobile/os/${o.numero}` : "/mobile/pedidos"}
                style={{ ...cardStyle, display: "block", textDecoration: "none", color: "inherit" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>{o.codigo}</strong>
                  <StatusChip value={o.status} />
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{o.equipamento?.nome}</div>
                <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                  {o.equipamento?.tag} · {o.equipamento?.setor || o.equipamento?.localizacao}
                  {labelDiasAberta(o.abertura) ? ` · ${labelDiasAberta(o.abertura)}` : ""}
                </div>
              </Link>
            ))}
          </div>
        )
      ) : equipamentos.length === 0 ? (
        <EmptyState title="Nenhum registro encontrado!" hint="Baixe o inventário da sua fila ou do seu setor." />
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {equipamentos.map((e) => (
            <Link
              key={e.tag}
              href={`/mobile/equipamento/${encodeURIComponent(e.tag)}`}
              style={{ ...cardStyle, display: "block", textDecoration: "none", color: "inherit" }}
            >
              <div style={{ fontWeight: 800 }}>{e.nome}</div>
              <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 4 }}>
                Setor: {e.setor || e.localizacao || "—"}
              </div>
              <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)" }}>
                {e.fabricante} {e.modelo ? `· ${e.modelo}` : ""}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>TAG: {e.tag}</div>
            </Link>
          ))}
        </div>
      )}
    </MobileFrame>
  );
}
