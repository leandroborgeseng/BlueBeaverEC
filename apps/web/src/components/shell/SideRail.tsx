"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ModuloPermissao } from "@nexo/shared";
import { temPermissao } from "@nexo/shared";
import { useSession } from "@/lib/session";
import { ICONS, Icon, type IconKey } from "./icons";

type FlyItem = { label: string; href: string; icon: IconKey; group?: boolean; modulo?: ModuloPermissao };

const RAIL: Array<{
  key: string;
  label: string;
  icon: IconKey;
  href?: string;
  modulo?: ModuloPermissao;
  items?: FlyItem[];
}> = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard", href: "/dashboard", modulo: "dashboard" },
  {
    key: "equip",
    label: "Equipamentos",
    icon: "equip",
    modulo: "equipamentos",
    items: [
      { label: "Equipamentos", href: "/equipamentos", icon: "equip", modulo: "equipamentos" },
      { label: "Ficha Vida do Equipamento", href: "/equipamentos/ficha-vida", icon: "history", modulo: "equipamentos" },
      { label: "Novo Laudo", href: "/laudos/novo", icon: "plus", modulo: "laudos" },
      { label: "Plano de Descrições", href: "/cadastros", icon: "clipboard", modulo: "equipamentos" },
      { label: "Fabricantes", href: "/cadastros", icon: "factory", modulo: "equipamentos" },
      { label: "Modelos", href: "/cadastros", icon: "layers", modulo: "equipamentos" },
      { label: "Procedimentos de Laudo", href: "/procedimentos-laudo", icon: "clipboard", modulo: "laudos" },
      { label: "Instrumentos e Padrões", href: "/instrumentos", icon: "clipboard", modulo: "laudos" },
      { label: "Certificados", href: "/certificados", icon: "clipboard", modulo: "laudos" },
      { label: "Cadastros Básicos", href: "/cadastros", icon: "folder", group: true, modulo: "equipamentos" },
    ],
  },
  {
    key: "os",
    label: "Ordens de\nServiço",
    icon: "os",
    modulo: "os",
    items: [
      { label: "Ordens de Serviço", href: "/os", icon: "os", modulo: "os" },
      { label: "Quadro de Processos", href: "/os/quadro-processos", icon: "columns", modulo: "os" },
      { label: "Ordem de Serviço Rápida", href: "/os/rapida", icon: "plus", modulo: "os" },
      { label: "Abrir Ordem de Serviço", href: "/os/nova", icon: "plus", modulo: "os" },
      { label: "Triagem de Solicitações", href: "/os/triagem-solicitacoes", icon: "megaphone", modulo: "os" },
      { label: "Fila Não Atribuídas", href: "/os/nao-atribuidas", icon: "flag", modulo: "os" },
      { label: "Certificados de Calibração", href: "/certificados", icon: "clipboard", modulo: "laudos" },
      { label: "Auditoria de Ordens de Serviço", href: "/os/auditoria", icon: "users", modulo: "os" },
    ],
  },
  {
    key: "gestao",
    label: "Gestão da\nManutenção",
    icon: "gestao",
    modulo: "contratos",
    items: [
      { label: "Contratos de Manutenção", href: "/contratos", icon: "contratos", modulo: "contratos" },
      { label: "Colaboradores", href: "/pessoas", icon: "users", modulo: "pessoas" },
      { label: "Instrumentos e Padrões", href: "/instrumentos", icon: "clipboard", modulo: "laudos" },
      { label: "Cadastros Básicos", href: "/cadastros", icon: "folder", group: true, modulo: "equipamentos" },
    ],
  },
  {
    key: "evolucao",
    label: "Evolução\nEstratégica",
    icon: "evolucao",
    modulo: "estrategico",
    items: [
      { label: "Dashboard Executivo", href: "/gestao/dashboard-executivo", icon: "compass", modulo: "estrategico" },
      { label: "Jornada de Evolução", href: "/gestao/jornada-evolucao", icon: "trend", modulo: "estrategico" },
      { label: "Avaliação de Maturidade", href: "/gestao/avaliacao-maturidade", icon: "target", modulo: "estrategico" },
      { label: "Central de Conformidade", href: "/gestao/conformidade", icon: "shield", modulo: "estrategico" },
      { label: "Indicadores", href: "/gestao/indicadores", icon: "trend", modulo: "estrategico" },
      { label: "Auditorias", href: "/auditorias", icon: "shield", modulo: "auditorias" },
      { label: "CAPEX", href: "/gestao/capex", icon: "dollar", modulo: "estrategico" },
      { label: "Relatórios", href: "/gestao/relatorios", icon: "clipboard", modulo: "estrategico" },
      { label: "Configurações da Organização", href: "/config", icon: "settings", modulo: "config" },
    ],
  },
  {
    key: "estoque",
    label: "Estoque",
    icon: "estoque",
    modulo: "estoque",
    items: [
      { label: "Itens em Estoque", href: "/estoque", icon: "archive", modulo: "estoque" },
      { label: "Cadastros Básicos", href: "/cadastros", icon: "folder", group: true, modulo: "equipamentos" },
    ],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    icon: "financeiro",
    modulo: "financeiro",
    items: [
      { label: "Financeiro", href: "/financeiro", icon: "dollar", modulo: "financeiro" },
      { label: "Contratos de Manutenção", href: "/contratos", icon: "contratos", modulo: "contratos" },
    ],
  },
  {
    key: "portal",
    label: "Portal do\nSolicitante",
    icon: "megaphone",
    modulo: "portal",
    items: [
      { label: "Abrir Solicitação de Serviço", href: "/portal/abrir-solicitacao", icon: "plus", modulo: "portal" },
      { label: "Cronograma de Calibração", href: "/portal/cronograma", icon: "clipboard", modulo: "portal" },
      { label: "Inventário do Setor", href: "/portal/inventario", icon: "equip", modulo: "portal" },
      { label: "App Campo (PWA)", href: "/mobile", icon: "equip", modulo: "portal" },
    ],
  },
];

const ACCENT = "#ffffff";

export function SideRail() {
  const pathname = usePathname();
  const router = useRouter();
  const me = useSession();
  const [openRail, setOpenRail] = useState<string | null>(null);

  const mapa = me?.permissoesModulos;
  const can = (modulo?: ModuloPermissao) => {
    if (!modulo) return true;
    return temPermissao(mapa, modulo, 1);
  };

  const visibleRail = useMemo(
    () =>
      RAIL.map((r) => ({
        ...r,
        items: r.items?.filter((i) => can(i.modulo)),
      })).filter((r) => {
        if (r.href) return can(r.modulo);
        return (r.items?.length ?? 0) > 0;
      }),
    [mapa],
  );

  const activeCat = useMemo(() => {
    if (pathname.startsWith("/dashboard")) return "dashboard";
    if (
      pathname.startsWith("/equipamentos") ||
      pathname.startsWith("/cadastros") ||
      pathname.startsWith("/procedimentos") ||
      pathname.startsWith("/instrumentos") ||
      pathname.startsWith("/certificados") ||
      pathname.startsWith("/laudos")
    )
      return "equip";
    if (pathname.startsWith("/os")) return "os";
    if (pathname.startsWith("/contratos") || pathname.startsWith("/pessoas")) return "gestao";
    if (pathname.startsWith("/gestao") || pathname.startsWith("/auditorias") || pathname.startsWith("/config"))
      return "evolucao";
    if (pathname.startsWith("/estoque")) return "estoque";
    if (pathname.startsWith("/financeiro")) return "financeiro";
    if (pathname.startsWith("/portal") || pathname.startsWith("/mobile")) return "portal";
    return null;
  }, [pathname]);

  return (
    <>
      <aside
        style={{
          width: 76,
          flexShrink: 0,
          background: "rgb(0,102,178)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "16px 0",
          position: "relative",
          zIndex: 30,
          borderRight: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 7,
            overflow: "hidden",
            marginBottom: 20,
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            backgroundImage: "url(/bluebeaver-logo.png)",
            backgroundSize: "auto 100%",
            backgroundPosition: "left center",
            backgroundRepeat: "no-repeat",
          }}
          title="Nexo"
        />

        {visibleRail.map((r) => {
          const active = openRail === r.key || activeCat === r.key;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => {
                if (r.href) {
                  setOpenRail(null);
                  router.push(r.href);
                  return;
                }
                setOpenRail((v) => (v === r.key ? null : r.key));
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.14)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = active ? "rgba(255,255,255,0.16)" : "transparent";
              }}
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                padding: "11px 4px",
                cursor: "pointer",
                color: ACCENT,
                border: "none",
                borderLeft: `2px solid ${active ? ACCENT : "transparent"}`,
                background: active ? "rgba(255,255,255,0.16)" : "transparent",
              }}
            >
              <Icon d={ICONS[r.icon]} size={19} />
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 600,
                  textAlign: "center",
                  lineHeight: 1.25,
                  whiteSpace: "pre-line",
                  letterSpacing: "0.01em",
                }}
              >
                {r.label}
              </span>
            </button>
          );
        })}
      </aside>

      {openRail && (
        <>
          <div onClick={() => setOpenRail(null)} style={{ position: "fixed", inset: 0, zIndex: 28 }} />
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 76,
              bottom: 0,
              width: 288,
              background: "white",
              boxShadow: "4px 0 24px rgba(16,24,40,0.1)",
              borderRight: "1px solid oklch(0.91 0.006 255)",
              zIndex: 29,
              overflowY: "auto",
              padding: "8px 0",
            }}
          >
            {(visibleRail.find((x) => x.key === openRail)?.items ?? []).map((f) => {
              const selected = pathname === f.href;
              return (
                <Link
                  key={`${f.href}-${f.label}`}
                  href={f.href}
                  onClick={() => setOpenRail(null)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "oklch(0.95 0.025 255)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    padding: "10px 20px",
                    cursor: "pointer",
                    color: selected
                      ? "oklch(0.55 0.16 255)"
                      : f.group
                        ? "oklch(0.45 0.02 250)"
                        : "oklch(0.3 0.02 250)",
                    fontWeight: selected || f.group ? 700 : 500,
                    fontSize: 13,
                    background: "transparent",
                    textDecoration: "none",
                  }}
                >
                  <Icon d={ICONS[f.icon]} size={16} />
                  <span>{f.label}</span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
