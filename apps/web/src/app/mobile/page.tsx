"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useOfflineQueue } from "@/lib/offline-queue";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { IconCalendar, IconList, IconPlus, IconQr, IconWrench } from "@/components/mobile/icons";
import {
  EmptyState,
  HeroAction,
  MiniKpi,
  PageTitle,
  PrioChip,
  QuickCard,
  SectionTitle,
  Skeleton,
  cardStyle,
  firstName,
  saudacaoNow,
  tonePrio,
} from "@/components/mobile/ui";
import { useMobilePersona } from "@/lib/session";

interface Kpis {
  abertas: number;
  urgentes: number;
  concluidasHoje: number;
}

interface Prox {
  numero: number;
  codigo: string | null;
  prioridade: string;
  equipamento: { tag: string; nome: string; setor: { nome: string } };
}

export default function MobileHomePage() {
  const { pending, online, flush } = useOfflineQueue();
  const { me, isEnfermeiro, isTecnico, canSolicitar, canInventario } = useMobilePersona();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [proximos, setProximos] = useState<Prox[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (isTecnico) {
          const [k, p] = await Promise.all([
            api<Kpis>("/mobile/kpis-hoje").catch(() => ({ abertas: 0, urgentes: 0, concluidasHoje: 0 })),
            api<Prox[]>("/mobile/proximos?limit=5").catch(() => []),
          ]);
          if (!cancelled) {
            setKpis(k);
            setProximos(p);
          }
        } else {
          if (!cancelled) setLoading(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isTecnico]);

  const nome = firstName(me?.nome);
  const setoresLabel = me?.setores?.map((s) => s.nome).join(" · ") || "Setor não vinculado";

  return (
    <MobileFrame title="Início" online={online} pending={pending} onSync={() => void flush()} badgeOs={kpis?.urgentes}>
      {!isEnfermeiro && (
        <>
          <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)", marginBottom: 2 }}>{saudacaoNow()}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "oklch(0.18 0.015 255)", marginBottom: 4 }}>{nome}</div>
          <div style={{ fontSize: 12.5, color: "oklch(0.5 0.02 250)", marginBottom: 16, fontWeight: 600 }}>
            Campo · Engenharia Clínica
          </div>
        </>
      )}

      {isEnfermeiro && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 18,
              background: "white",
              border: "1px solid oklch(0.91 0.006 255)",
              borderRadius: 16,
              padding: "12px 14px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/bluebeaver-logo.png"
              alt="Aion"
              style={{ height: 40, width: "auto", borderRadius: 8, flexShrink: 0 }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em" }}>Aion Campo</div>
              <div style={{ fontSize: 12, color: "oklch(0.5 0.02 250)", fontWeight: 600, marginTop: 1 }}>
                {me?.estabelecimentoNome || "Engenharia Clínica"}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, color: "oklch(0.5 0.02 250)", marginBottom: 2 }}>{saudacaoNow()}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "oklch(0.18 0.015 255)", marginBottom: 4 }}>{nome}</div>
          <div style={{ fontSize: 12.5, color: "oklch(0.5 0.02 250)", marginBottom: 18, fontWeight: 600 }}>
            {setoresLabel}
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <HeroAction
              href="/mobile/abrir"
              title="Abrir ordem de serviço"
              subtitle="TAG, QR code ou busca nos equipamentos do seu departamento"
              accent="oklch(0.55 0.16 38)"
              accentBg="oklch(0.96 0.04 55)"
              icon={<IconPlus size={22} color="oklch(0.55 0.16 38)" stroke={2.1} />}
            />
            <HeroAction
              href="/mobile/cronograma"
              title="Cronograma"
              subtitle="Calibração, TSE e preventivas do seu setor"
              accent="oklch(0.45 0.14 255)"
              accentBg="oklch(0.95 0.03 255)"
              icon={<IconCalendar size={22} color="oklch(0.45 0.14 255)" stroke={2.1} />}
            />
            <HeroAction
              href="/mobile/pedidos"
              title="Ordens em andamento"
              subtitle="Acompanhe OS abertas e os chamados que você enviou"
              accent="oklch(0.4 0.12 150)"
              accentBg="oklch(0.94 0.04 150)"
              icon={<IconList size={22} color="oklch(0.4 0.12 150)" stroke={2.1} />}
            />
          </div>
        </>
      )}

      {isTecnico && (
        <>
          {loading ? (
            <Skeleton rows={3} />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 }}>
                <MiniKpi label="Abertas" value={kpis?.abertas ?? 0} color="oklch(0.4 0.16 255)" />
                <MiniKpi label="Urgentes" value={kpis?.urgentes ?? 0} color="oklch(0.5 0.16 38)" />
                <MiniKpi label="Hoje" value={kpis?.concluidasHoje ?? 0} color="oklch(0.4 0.13 150)" />
              </div>
              <SectionTitle href="/mobile/os">Próximos atendimentos</SectionTitle>
              {proximos.length === 0 ? (
                <EmptyState title="Fila limpa" hint="Nenhum atendimento atribuído no momento." />
              ) : (
                <div style={{ display: "grid", gap: 9, marginBottom: 18 }}>
                  {proximos.map((os) => {
                    const p = tonePrio(os.prioridade);
                    return (
                      <Link
                        key={os.numero}
                        href={`/mobile/os/${os.numero}`}
                        style={{
                          ...cardStyle,
                          display: "flex",
                          alignItems: "center",
                          gap: 11,
                          textDecoration: "none",
                          color: "inherit",
                        }}
                      >
                        <div
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 9,
                            background: p.bg,
                            flexShrink: 0,
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          <IconWrench size={18} color={p.color} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13.5,
                              fontWeight: 700,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {os.equipamento.nome || os.equipamento.tag}
                          </div>
                          <div style={{ fontSize: 11.5, color: "oklch(0.55 0.02 250)" }}>
                            {os.codigo ?? `OS-${os.numero}`} · {os.equipamento.setor.nome}
                          </div>
                        </div>
                        <PrioChip value={os.prioridade} />
                      </Link>
                    );
                  })}
                </div>
              )}
              <SectionTitle>Acesso rápido</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <QuickCard
                  href="/mobile/qr"
                  label="Ler QR do equipamento"
                  icon={<IconQr size={20} color="oklch(0.55 0.16 255)" />}
                />
                {canSolicitar ? (
                  <QuickCard
                    href="/mobile/solicitar"
                    label="Abrir solicitação"
                    icon={<IconPlus size={20} color="oklch(0.55 0.16 255)" />}
                  />
                ) : canInventario ? (
                  <QuickCard
                    href="/mobile/inventario"
                    label="Consultar inventário"
                    icon={<IconWrench size={20} color="oklch(0.55 0.16 255)" />}
                  />
                ) : (
                  <QuickCard
                    href="/mobile/os"
                    label="Minhas OS"
                    icon={<IconWrench size={20} color="oklch(0.55 0.16 255)" />}
                  />
                )}
              </div>
            </>
          )}
        </>
      )}

      {!isTecnico && !isEnfermeiro && (
        <PageTitle title="Aion Campo" subtitle="Este perfil não tem módulo de campo. Use o desktop ou peça acesso." />
      )}
    </MobileFrame>
  );
}
