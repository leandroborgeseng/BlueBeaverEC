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
  atribuicaoVersao?: number;
  equipamento: { tag: string; nome: string; setor: { nome: string } };
  responsavel?: { id: string } | null;
}

export default function MobileOsPage() {
  const router = useRouter();
  const { isEnfermeiro, isTecnico } = useMobilePersona();
  const [items, setItems] = useState<OsRow[]>([]);
  const [livres, setLivres] = useState<OsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"TODAS" | "URGENTES" | "ABERTAS" | "LIVRES">("TODAS");
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { pending, online, flush } = useOfflineQueue();

  async function load() {
    const [minhas, fila] = await Promise.all([
      api<OsRow[]>("/mobile/minhas-os"),
      api<{ items: OsRow[] }>("/os?fila=nao-atribuidas&pageSize=30").catch(() => ({ items: [] })),
    ]);
    setItems(minhas);
    setLivres(fila.items ?? []);
  }

  useEffect(() => {
    if (isEnfermeiro) {
      router.replace("/mobile/pedidos");
      return;
    }
    void load()
      .catch(() => {
        setItems([]);
        setLivres([]);
      })
      .finally(() => setLoading(false));
  }, [isEnfermeiro, router]);

  async function assumir(os: OsRow) {
    if (busy) return;
    setBusy(os.numero);
    try {
      await api(`/os/${os.numero}/assumir`, {
        method: "PATCH",
        body: JSON.stringify({
          expectedResponsavelId: os.responsavel?.id ?? null,
          expectedVersao: os.atribuicaoVersao,
        }),
      });
      setMsg(`${os.codigo} assumida`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não foi possível assumir");
    } finally {
      setBusy(null);
    }
  }

  const filtered = useMemo(() => {
    if (filtro === "LIVRES") return livres;
    if (filtro === "URGENTES") return items.filter((o) => o.prioridade === "URGENTE" || o.prioridade === "ALTA");
    if (filtro === "ABERTAS") {
      return items.filter((o) =>
        ["NAO_ATRIBUIDA", "ABERTA", "EM_ANDAMENTO", "AGUARDANDO"].includes(o.status),
      );
    }
    return items;
  }, [items, livres, filtro]);

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
      <PageTitle
        title="Minha fila de OS"
        subtitle={`${items.length} atribuída(s)${livres.length ? ` · ${livres.length} livre(s)` : ""}`}
      />
      {msg && <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "oklch(0.4 0.12 150)" }}>{msg}</div>}
      <FilterPills
        value={filtro}
        onChange={setFiltro}
        options={[
          { id: "TODAS", label: "Minhas" },
          { id: "LIVRES", label: "Livres", count: livres.length },
          { id: "ABERTAS", label: "Abertas" },
          { id: "URGENTES", label: "Urgentes", count: urgentes },
        ]}
      />
      {loading ? (
        <Skeleton rows={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nenhuma OS neste filtro"
          hint={filtro === "LIVRES" ? "Não há OS livres para assumir." : "Quando houver atendimento atribuído, ele aparece aqui."}
        />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((os) => {
            const p = tonePrio(os.prioridade);
            return (
              <div key={os.id} style={{ display: "grid", gap: 6 }}>
                <ListCard
                  href={`/mobile/os/${os.numero}`}
                  title={os.equipamento?.nome || os.equipamento?.tag || os.codigo}
                  subtitle={`${os.codigo} · ${os.equipamento?.setor?.nome ?? "Setor"}`}
                  icon={<IconWrench size={18} color={p.color} />}
                  iconBg={p.bg}
                  trailing={
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                      <PrioChip value={os.prioridade} />
                      <StatusChip value={os.status} atrasada={os.atrasada} />
                    </div>
                  }
                />
                {filtro === "LIVRES" && (
                  <button
                    type="button"
                    disabled={busy === os.numero}
                    onClick={() => void assumir(os)}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      border: "1px solid oklch(0.88 0.02 255)",
                      background: "white",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    {busy === os.numero ? "Assumindo…" : "Assumir esta OS"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </MobileFrame>
  );
}
