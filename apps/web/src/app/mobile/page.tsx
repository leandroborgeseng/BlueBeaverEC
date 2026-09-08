"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useOfflineQueue } from "@/lib/offline-queue";
import { MobileFrame } from "@/components/mobile/MobileFrame";
import { IconBox, IconCalendar, IconList, IconPlus, IconQr, IconWrench } from "@/components/mobile/icons";
import {
  BrandHeader,
  EmptyState,
  HeroAction,
  HomeGreeting,
  PageTitle,
  PrioChip,
  SectionTitle,
  Skeleton,
  cardStyle,
  firstName,
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
  const { me, isEnfermeiro, isTecnico, canInventario } = useMobilePersona();
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
  const hospital = me?.estabelecimentoNome || "Engenharia Clínica";
  const setoresLabel = me?.setores?.map((s) => s.nome).join(" · ") || "Setor não vinculado";
  const filaSubtitle = loading
    ? "Checklist, fotos e baixa de peças no atendimento"
    : kpis?.urgentes
      ? `${kpis.urgentes} urgente(s) · ${kpis.abertas} na fila`
      : `${kpis?.abertas ?? 0} OS atribuídas · ${kpis?.concluidasHoje ?? 0} concluída(s) hoje`;

  return (
    <MobileFrame title="Início" online={online} pending={pending} onSync={() => void flush()} badgeOs={kpis?.urgentes}>
      {isEnfermeiro && (
        <>
          <BrandHeader subtitle={hospital} />
          <HomeGreeting name={nome} caption={setoresLabel} />
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
          <BrandHeader subtitle={hospital} />
          <HomeGreeting name={nome} caption="Técnico · Engenharia Clínica" />
          <div style={{ display: "grid", gap: 10, marginBottom: 18 }}>
            <HeroAction
              href="/mobile/os"
              title="Minha fila de OS"
              subtitle={filaSubtitle}
              accent="oklch(0.55 0.16 38)"
              accentBg="oklch(0.96 0.04 55)"
              badge={kpis?.urgentes}
              icon={<IconWrench size={22} color="oklch(0.55 0.16 38)" stroke={2.1} />}
            />
            <HeroAction
              href="/mobile/qr"
              title="Identificar equipamento"
              subtitle="QR code ou TAG para ver ficha, OS abertas e inventário"
              accent="oklch(0.45 0.14 255)"
              accentBg="oklch(0.95 0.03 255)"
              icon={<IconQr size={22} color="oklch(0.45 0.14 255)" stroke={2.1} />}
            />
            {canInventario ? (
              <HeroAction
                href="/mobile/inventario"
                title="Inventário"
                subtitle="Consultar e atualizar TAG, patrimônio e situação do parque"
                accent="oklch(0.4 0.12 150)"
                accentBg="oklch(0.94 0.04 150)"
                icon={<IconBox size={22} color="oklch(0.4 0.12 150)" stroke={2.1} />}
              />
            ) : (
              <HeroAction
                href="/mobile/os"
                title="Ordens de serviço"
                subtitle="Abra a fila completa de atendimentos atribuídos a você"
                accent="oklch(0.4 0.12 150)"
                accentBg="oklch(0.94 0.04 150)"
                icon={<IconList size={22} color="oklch(0.4 0.12 150)" stroke={2.1} />}
              />
            )}
          </div>
          <SectionTitle href="/mobile/os">Próximos atendimentos</SectionTitle>
          {loading ? (
            <Skeleton rows={3} />
          ) : proximos.length === 0 ? (
            <EmptyState title="Fila limpa" hint="Nenhum atendimento atribuído no momento." />
          ) : (
            <div style={{ display: "grid", gap: 9 }}>
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
        </>
      )}

      {!isTecnico && !isEnfermeiro && (
        <PageTitle title="Aion Campo" subtitle="Este perfil não tem módulo de campo. Use o desktop ou peça acesso." />
      )}
    </MobileFrame>
  );
}
