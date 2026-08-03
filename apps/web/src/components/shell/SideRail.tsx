"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ModuloPermissao, NivelPermissao } from "@aion/shared";
import { PERMISSAO_NIVEL, temPermissao } from "@aion/shared";
import { useSession } from "@/lib/session";
import { ICONS, Icon, type IconKey } from "./icons";

type FlyItem = {
  label: string;
  href: string;
  icon: IconKey;
  group?: boolean;
  modulo?: ModuloPermissao;
  minNivel?: NivelPermissao;
  /** Pathnames adicionais que marcam o item como ativo. */
  match?: string[];
};

type RailItem = {
  key: string;
  label: string;
  icon: IconKey;
  href?: string;
  modulo?: ModuloPermissao;
  minNivel?: NivelPermissao;
  items?: FlyItem[];
};

/**
 * IA UX-1 — um dono por destino.
 * Operação · Gestão · Estratégia · Admin · personas Portal vs Campo.
 */
const RAIL: RailItem[] = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard", href: "/dashboard", modulo: "dashboard" },
  {
    key: "equip",
    label: "Equipamentos",
    icon: "equip",
    modulo: "equipamentos",
    items: [
      { label: "Equipamentos", href: "/equipamentos", icon: "equip", modulo: "equipamentos" },
      { label: "Ficha Vida", href: "/equipamentos/ficha-vida", icon: "history", modulo: "equipamentos" },
      { label: "Laudos", href: "/laudos", icon: "clipboard", modulo: "laudos" },
      { label: "Novo Laudo", href: "/laudos/novo", icon: "plus", modulo: "laudos" },
      { label: "Procedimentos de Laudo", href: "/procedimentos-laudo", icon: "layers", modulo: "laudos" },
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
      {
        label: "Filas",
        href: "/os/filas",
        icon: "columns",
        modulo: "os",
        match: ["/os/filas", "/os/quadro-processos", "/os/triagem-solicitacoes", "/os/nao-atribuidas"],
      },
      { label: "Nova OS", href: "/os/nova", icon: "plus", modulo: "os" },
      { label: "Auditoria de OS", href: "/os/auditoria", icon: "users", modulo: "os" },
    ],
  },
  {
    key: "gestao",
    label: "Gestão da\nManutenção",
    icon: "gestao",
    modulo: "contratos",
    items: [
      { label: "Contratos", href: "/contratos", icon: "contratos", modulo: "contratos" },
      { label: "Colaboradores", href: "/pessoas", icon: "users", modulo: "pessoas" },
      { label: "Instrumentos e Padrões", href: "/instrumentos", icon: "target", modulo: "laudos" },
      { label: "Certificados", href: "/certificados", icon: "shield", modulo: "laudos" },
      { label: "Biblioteca de POPs", href: "/biblioteca-pops", icon: "folder", modulo: "laudos" },
      {
        label: "Cronograma de Manutenção",
        href: "/gestao/cronograma-manutencao",
        icon: "calendar",
        modulo: "estrategico",
      },
    ],
  },
  {
    key: "evolucao",
    label: "Evolução\nEstratégica",
    icon: "evolucao",
    modulo: "estrategico",
    items: [
      { label: "Jornada de Evolução", href: "/gestao/jornada-evolucao", icon: "trend", modulo: "estrategico" },
      { label: "Painel Executivo", href: "/gestao/dashboard-executivo", icon: "compass", modulo: "estrategico" },
      { label: "Maturidade", href: "/gestao/avaliacao-maturidade", icon: "target", modulo: "estrategico" },
      { label: "Conformidade", href: "/gestao/conformidade", icon: "shield", modulo: "estrategico" },
      { label: "Indicadores", href: "/gestao/indicadores", icon: "trend", modulo: "estrategico" },
      { label: "Auditorias", href: "/auditorias", icon: "flag", modulo: "auditorias" },
      { label: "CAPEX", href: "/gestao/capex", icon: "dollar", modulo: "estrategico" },
      { label: "Relatórios", href: "/gestao/relatorios", icon: "clipboard", modulo: "estrategico" },
      { label: "Mapeamento de Planos", href: "/gestao/mapeamento-planos", icon: "layers", modulo: "estrategico" },
    ],
  },
  { key: "estoque", label: "Estoque", icon: "estoque", href: "/estoque", modulo: "estoque" },
  { key: "financeiro", label: "Financeiro", icon: "financeiro", href: "/financeiro", modulo: "financeiro" },
  {
    key: "portal",
    label: "Portal\nSolicitante",
    icon: "megaphone",
    modulo: "portal",
    items: [
      { label: "Abrir Solicitação", href: "/portal/abrir-solicitacao", icon: "plus", modulo: "portal" },
      { label: "Cronograma de Calibração", href: "/portal/cronograma", icon: "calendar", modulo: "portal" },
      { label: "Inventário do Setor", href: "/portal/inventario", icon: "equip", modulo: "portal" },
    ],
  },
  {
    key: "campo",
    label: "App\nCampo",
    icon: "pin",
    href: "/mobile",
    modulo: "os",
    minNivel: PERMISSAO_NIVEL.EDICAO,
  },
  { key: "config", label: "Config", icon: "settings", href: "/config", modulo: "config" },
];

const ACCENT = "#ffffff";

function flyItemActive(item: FlyItem, pathname: string) {
  if (item.match?.includes(pathname)) return true;
  const path = item.href.split("?")[0] ?? item.href;
  return pathname === path;
}

export function SideRail() {
  const pathname = usePathname();
  const router = useRouter();
  const me = useSession();
  const [openRail, setOpenRail] = useState<string | null>(null);

  const mapa = me?.permissoesModulos;
  const can = (modulo?: ModuloPermissao, minNivel: NivelPermissao = PERMISSAO_NIVEL.LEITURA) => {
    if (!modulo) return true;
    return temPermissao(mapa, modulo, minNivel);
  };

  const visibleRail = useMemo(
    () =>
      RAIL.map((r) => ({
        ...r,
        items: r.items?.filter((i) => can(i.modulo, i.minNivel ?? PERMISSAO_NIVEL.LEITURA)),
      })).filter((r) => {
        if (r.href) return can(r.modulo, r.minNivel ?? PERMISSAO_NIVEL.LEITURA);
        return (r.items?.length ?? 0) > 0;
      }),
    [mapa],
  );

  const activeCat = useMemo(() => {
    if (pathname.startsWith("/dashboard")) return "dashboard";
    if (pathname.startsWith("/config")) return "config";
    if (pathname.startsWith("/mobile")) return "campo";
    if (pathname.startsWith("/portal")) return "portal";
    if (
      pathname.startsWith("/equipamentos") ||
      pathname.startsWith("/cadastros") ||
      pathname.startsWith("/procedimentos") ||
      pathname.startsWith("/laudos")
    ) {
      return "equip";
    }
    if (pathname.startsWith("/os")) return "os";
    if (
      pathname.startsWith("/contratos") ||
      pathname.startsWith("/pessoas") ||
      pathname.startsWith("/instrumentos") ||
      pathname.startsWith("/certificados") ||
      pathname.startsWith("/biblioteca-pops") ||
      pathname.startsWith("/gestao/cronograma-manutencao")
    ) {
      return "gestao";
    }
    if (pathname.startsWith("/gestao") || pathname.startsWith("/auditorias")) return "evolucao";
    if (pathname.startsWith("/estoque")) return "estoque";
    if (pathname.startsWith("/financeiro")) return "financeiro";
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
          title="Aion Engenharia Clínica"
        />

        {visibleRail.map((r) => {
          const active = openRail === r.key || activeCat === r.key;
          const expanded = openRail === r.key && Boolean(r.items?.length);
          return (
            <button
              key={r.key}
              type="button"
              aria-expanded={r.items ? expanded : undefined}
              aria-controls={r.items ? `flyout-${r.key}` : undefined}
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
                  fontSize: 11,
                  fontWeight: 600,
                  textAlign: "center",
                  lineHeight: 1.2,
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
            id={`flyout-${openRail}`}
            role="navigation"
            aria-label={visibleRail.find((x) => x.key === openRail)?.label.replace("\n", " ")}
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
              const selected = flyItemActive(f, pathname);
              return (
                <Link
                  key={`${f.href}-${f.label}`}
                  href={f.href}
                  onClick={() => setOpenRail(null)}
                  aria-current={selected ? "page" : undefined}
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
