"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { useCampoCache } from "@/lib/mobile-cache";
import { labelDiasAberta } from "@/lib/mobile-ficha";
import { useOfflineQueue } from "@/lib/offline-queue";
import { useMobilePersona, useSession } from "@/lib/session";
import { IconSearch } from "@/components/mobile/icons";
import {
  EmptyState,
  FilterPills,
  PageTitle,
  PrioChip,
  PrimaryButton,
  Skeleton,
  StatusChip,
  cardStyle,
  fieldStyle,
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
  const [q, setQ] = useState("");
  const { pending, online, flush } = useOfflineQueue();

  useEffect(() => {
    Promise.all([
      api<Pedido[]>("/solicitacoes").catch(() => []),
      api<OsAberta[]>("/portal/os-abertas").catch(() => []),
    ])
      .then(([p, os]) => {
        setPedidos(p);
        if (os.length) {
          setOsSetor(os);
          return;
        }
        const local = useCampoCache.getState().os;
        if (local.length) {
          setOsSetor(
            local.map((o) => ({
              id: o.id,
              numero: o.numero,
              codigo: o.codigo,
              tipo: "CORRETIVA",
              status: o.status,
              prioridade: o.prioridade,
              abertura: typeof o.abertura === "string" ? o.abertura : "",
              equipamento: {
                tag: o.equipamento.tag,
                nome: o.equipamento.nome,
                setor: o.equipamento.setor || o.equipamento.localizacao || "—",
              },
            })),
          );
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const meusFiltrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    let rows = pedidos;
    if (filtro === "PENDENTE") rows = pedidos.filter((p) => p.status === "PENDENTE");
    if (filtro === "CONVERTIDA") rows = pedidos.filter((p) => p.status === "CONVERTIDA");
    if (!s) return rows;
    return rows.filter((p) =>
      [p.protocolo, p.descricao, p.setorNome, p.equipamento?.tag, p.equipamento?.nome]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(s),
    );
  }, [pedidos, filtro, q]);

  const osFiltradas = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return osSetor;
    return osSetor.filter((os) =>
      [os.codigo, os.equipamento.tag, os.equipamento.nome, os.equipamento.setor]
        .join(" ")
        .toLowerCase()
        .includes(s),
    );
  }, [osSetor, q]);

  const pendentes = pedidos.filter((p) => p.status === "PENDENTE").length;
  const setorLabel = me?.setores?.map((s) => s.nome).join(" · ") || "setor não vinculado";

  return (
    <MobileFrame title="OS" online={online} pending={pending} onSync={() => void flush()}>
      <PageTitle
        title="Ordens em andamento"
        subtitle={isEnfermeiro ? `OS abertas de ${setorLabel}` : "Solicitações recentes"}
      />

      <div style={{ position: "relative", marginBottom: 12 }}>
        <span style={{ position: "absolute", left: 12, top: 13, pointerEvents: "none" }}>
          <IconSearch size={16} color="oklch(0.55 0.02 250)" />
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pesquisar…"
          style={{ ...fieldStyle, paddingLeft: 36 }}
        />
      </div>

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
        osFiltradas.length === 0 ? (
          <EmptyState
            title="Nenhuma OS aberta no setor"
            hint="Quando a engenharia clínica estiver atendendo um equipamento daqui, a OS aparece nesta lista."
            action={<PrimaryButton href="/mobile/abrir">Abrir ordem de serviço</PrimaryButton>}
          />
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {osFiltradas.map((os) => (
              <div key={os.id} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                  <strong style={{ fontSize: 14.5 }}>{os.codigo}</strong>
                  <PrioChip value={os.prioridade} />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 650 }}>{os.equipamento.nome}</div>
                <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", marginTop: 6 }}>
                  {os.equipamento.tag} · {os.equipamento.setor} · {os.tipo.replace(/_/g, " ")}
                  {labelDiasAberta(os.abertura) ? ` · ${labelDiasAberta(os.abertura)}` : ""}
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
