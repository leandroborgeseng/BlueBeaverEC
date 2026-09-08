"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useMobilePersona, useSession } from "@/lib/session";
import {
  EmptyState,
  FilterPills,
  PageTitle,
  PrioChip,
  PrimaryButton,
  Skeleton,
  StatusChip,
  cardStyle,
} from "@/components/mobile/ui";

interface Pedido {
  id: string;
  protocolo: string;
  status: string;
  descricao: string;
  urgencia?: string;
  justificativaRecusa?: string | null;
  setorNome?: string;
  equipamento?: { tag: string; nome: string } | null;
  ordemServico?: { codigo: string; status?: string } | null;
}

interface OsAberta {
  id: string;
  numero: number;
  codigo: string;
  tipo: string;
  status: string;
  prioridade: string;
  abertura: string;
  equipamento: { tag: string; nome: string; setor: string };
}

export default function MobilePedidosPage() {
  const me = useSession();
  const { isEnfermeiro } = useMobilePersona();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [osSetor, setOsSetor] = useState<OsAberta[]>([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<"OS" | "MEUS">("OS");
  const [filtro, setFiltro] = useState<"TODAS" | "PENDENTE" | "CONVERTIDA">("TODAS");
  const { pending, online, flush } = useOfflineQueue();

  useEffect(() => {
    Promise.all([
      api<Pedido[]>("/solicitacoes").catch(() => []),
      api<OsAberta[]>("/portal/os-abertas").catch(() => []),
    ])
      .then(([p, os]) => {
        setPedidos(p);
        setOsSetor(os);
      })
      .finally(() => setLoading(false));
  }, []);

  const meusFiltrados = useMemo(() => {
    if (filtro === "PENDENTE") return pedidos.filter((p) => p.status === "PENDENTE");
    if (filtro === "CONVERTIDA") return pedidos.filter((p) => p.status === "CONVERTIDA");
    return pedidos;
  }, [pedidos, filtro]);

  const pendentes = pedidos.filter((p) => p.status === "PENDENTE").length;
  const setorLabel = me?.setores?.map((s) => s.nome).join(" · ") || "seu hospital";

  return (
    <MobileFrame title="OS" online={online} pending={pending} onSync={() => void flush()}>
      <PageTitle
        title="Ordens em andamento"
        subtitle={isEnfermeiro ? `OS abertas de ${setorLabel}` : "Solicitações recentes"}
      />

      <FilterPills
        value={aba}
        onChange={setAba}
        options={[
          { id: "OS", label: "OS do setor", count: osSetor.length },
          { id: "MEUS", label: "Meus chamados", count: pendentes },
        ]}
      />

      {loading ? (
        <Skeleton rows={4} />
      ) : aba === "OS" ? (
        osSetor.length === 0 ? (
          <EmptyState
            title="Nenhuma OS aberta no setor"
            hint="Quando a engenharia clínica estiver atendendo um equipamento daqui, a OS aparece nesta lista."
            action={<PrimaryButton href="/mobile/abrir">Abrir ordem de serviço</PrimaryButton>}
          />
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {osSetor.map((os) => (
              <div key={os.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <strong style={{ fontSize: 14.5 }}>{os.codigo}</strong>
                  <PrioChip value={os.prioridade} />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 650 }}>{os.equipamento.nome}</div>
                <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 6 }}>
                  {os.equipamento.tag} · {os.equipamento.setor} · {os.tipo.replace(/_/g, " ")}
                </div>
                <div style={{ marginTop: 8 }}>
                  <StatusChip value={os.status} />
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <FilterPills
            value={filtro}
            onChange={setFiltro}
            options={[
              { id: "TODAS", label: "Todas" },
              { id: "PENDENTE", label: "Pendentes", count: pendentes },
              { id: "CONVERTIDA", label: "Em OS" },
            ]}
          />
          {meusFiltrados.length === 0 ? (
            <EmptyState
              title="Nenhum chamado neste filtro"
              hint="Abra uma ordem de serviço para a engenharia clínica."
              action={<PrimaryButton href="/mobile/abrir">Nova OS</PrimaryButton>}
            />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {meusFiltrados.map((p) => (
                <div key={p.id} style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                    <strong style={{ fontSize: 14.5 }}>{p.protocolo}</strong>
                    <StatusChip value={p.status} />
                  </div>
                  <div style={{ fontSize: 13, color: "oklch(0.32 0.02 250)", lineHeight: 1.4 }}>{p.descricao}</div>
                  <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 8 }}>
                    {p.equipamento ? `${p.equipamento.tag} · ${p.equipamento.nome}` : p.setorNome ?? "Sem equipamento"}
                    {p.ordemServico ? ` · ${p.ordemServico.codigo}` : ""}
                  </div>
                  {p.justificativaRecusa && (
                    <div style={{ fontSize: 12, color: "oklch(0.5 0.17 25)", marginTop: 8, fontWeight: 600 }}>
                      Recusada: {p.justificativaRecusa}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </MobileFrame>
  );
}
