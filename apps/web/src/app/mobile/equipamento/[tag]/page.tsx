"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useCampoCache } from "@/lib/mobile-cache";
import { fromEquipamentoApi, type FichaCampo } from "@/lib/mobile-ficha";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useMobilePersona } from "@/lib/session";
import { EquipamentoFicha } from "@/components/mobile/EquipamentoFicha";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { Banner, EmptyState, PageTitle, Skeleton } from "@/components/mobile/ui";

export default function MobileEquipamentoPage() {
  const params = useParams<{ tag: string }>();
  const tag = decodeURIComponent(params.tag ?? "");
  const { isTecnico, canInventario } = useMobilePersona();
  const { pending, online, flush } = useOfflineQueue();
  const cached = useCampoCache((s) => s.getEquipamento(tag));
  const [ficha, setFicha] = useState<FichaCampo | null>(cached ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setErro(null);
      try {
        const data = await api<{ ficha?: FichaCampo; equipamento: Parameters<typeof fromEquipamentoApi>[0] }>(
          isTecnico
            ? `/mobile/equipamento/qr/${encodeURIComponent(tag)}`
            : `/portal/equipamento/${encodeURIComponent(tag)}`,
        );
        if (cancelled) return;
        setFicha(data.ficha ?? fromEquipamentoApi(data.equipamento));
      } catch (e) {
        if (cancelled) return;
        if (cached) setFicha(cached);
        else setErro(e instanceof Error ? e.message : "Equipamento não encontrado");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tag, isTecnico, cached]);

  return (
    <MobileFrame title={ficha?.nome || tag} online={online} pending={pending} onSync={() => void flush()}>
      <PageTitle title={ficha?.nome || "Equipamento"} subtitle={ficha?.tag || tag} />
      {loading ? (
        <Skeleton rows={4} />
      ) : erro && !ficha ? (
        <EmptyState title="Não encontrado" hint={erro} />
      ) : ficha ? (
        <>
          {erro && (
            <div style={{ marginBottom: 10 }}>
              <Banner tone="info">{erro} — mostrando cópia do aparelho.</Banner>
            </div>
          )}
          <EquipamentoFicha ficha={ficha} podeFoto={canInventario && Boolean(ficha.fotoDocumentoId)} />
        </>
      ) : null}
    </MobileFrame>
  );
}
