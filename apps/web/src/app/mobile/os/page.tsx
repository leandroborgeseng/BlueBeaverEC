"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useMobilePersona } from "@/lib/session";
import { IconWrench } from "@/components/mobile/icons";
import {
  EmptyState,
  FilterPills,
  ListCard,
  PageTitle,
  PrioChip,
  Skeleton,
  StatusChip,
  tonePrio,
} from "@/components/mobile/ui";

interface OsRow {
  id: string;
  numero: number;
  codigo: string;
  prioridade: string;
  status: string;
  atrasada: boolean;
  equipamento: { tag: string; nome: string; setor: { nome: string } };
}

export default function MobileOsPage() {
  const router = useRouter();
  const { isEnfermeiro, isTecnico } = useMobilePersona();
  const [items, setItems] = useState<OsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"TODAS" | "URGENTES" | "ABERTAS">("TODAS");
  const { pending, online, flush } = useOfflineQueue();

  useEffect(() => {
    if (isEnfermeiro) {
      router.replace("/mobile/pedidos");
      return;
    }
    api<OsRow[]>("/mobile/minhas-os")
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [isEnfermeiro, router]);

  const filtered = useMemo(() => {
    if (filtro === "URGENTES") return items.filter((o) => o.prioridade === "URGENTE" || o.prioridade === "ALTA");
    if (filtro === "ABERTAS") return items.filter((o) => o.status === "ABERTA" || o.status === "EM_ANDAMENTO");
    return items;
  }, [items, filtro]);

  const urgentes = items.filter((o) => o.prioridade === "URGENTE" || o.prioridade === "ALTA").length;

  if (!isTecnico && !isEnfermeiro) {
    return (
      <MobileFrame title="OS" online={online} pending={pending} onSync={() => void flush()}>
        <EmptyState title="Sem permissão" hint="Este perfil não executa ordens de serviço." />
      </MobileFrame>
    );
  }

  return (
    <MobileFrame title="Minhas OS" online={online} pending={pending} onSync={() => void flush()} badgeOs={urgentes}>
      <PageTitle title="Minha fila de OS" subtitle={`${items.length} atribuída(s) · execute checklist, fotos e peças`} />
      <FilterPills
        value={filtro}
        onChange={setFiltro}
        options={[
          { id: "TODAS", label: "Todas" },
          { id: "ABERTAS", label: "Abertas" },
          { id: "URGENTES", label: "Urgentes", count: urgentes },
        ]}
      />
      {loading ? (
        <Skeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState title="Nenhuma OS neste filtro" hint="Quando houver atendimento atribuído, ele aparece aqui." />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((os) => {
            const p = tonePrio(os.prioridade);
            return (
              <ListCard
                key={os.id}
                href={`/mobile/os/${os.numero}`}
                title={os.equipamento.nome || os.equipamento.tag}
                subtitle={`${os.codigo} · ${os.equipamento.setor.nome}`}
                icon={<IconWrench size={18} color={p.color} />}
                iconBg={p.bg}
                trailing={
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <PrioChip value={os.prioridade} />
                    <StatusChip value={os.status} atrasada={os.atrasada} />
                  </div>
                }
              />
            );
          })}
        </div>
      )}
    </MobileFrame>
  );
}
