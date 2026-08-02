"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

const RAIL = [
  {
    key: "ops",
    label: "Operação",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/equipamentos", label: "Equipamentos" },
      { href: "/os", label: "Ordens de Serviço" },
      { href: "/os/nova", label: "Abrir OS" },
      { href: "/os/nao-atribuidas", label: "Fila Não Atribuídas" },
      { href: "/os/triagem-solicitacoes", label: "Triagem de Solicitações" },
      { href: "/os/quadro-processos", label: "Quadro de Processos" },
    ],
  },
  {
    key: "cad",
    label: "Cadastros",
    items: [
      { href: "/cadastros", label: "Cadastros base" },
      { href: "/estoque", label: "Estoque" },
      { href: "/contratos", label: "Contratos" },
      { href: "/pessoas", label: "Pessoas e Equipes" },
      { href: "/procedimentos-laudo", label: "Procedimentos de Laudo" },
      { href: "/instrumentos", label: "Instrumentos e Padrões" },
      { href: "/certificados", label: "Certificados" },
      { href: "/laudos/novo", label: "Novo Laudo" },
    ],
  },
  {
    key: "gest",
    label: "Gestão",
    items: [
      { href: "/gestao/dashboard-executivo", label: "Dashboard Executivo" },
      { href: "/gestao/avaliacao-maturidade", label: "Avaliação Maturidade" },
      { href: "/gestao/jornada-evolucao", label: "Jornada de Evolução" },
      { href: "/gestao/conformidade", label: "Conformidade / POPs" },
      { href: "/gestao/indicadores", label: "Indicadores" },
      { href: "/auditorias", label: "Auditorias / NC" },
      { href: "/gestao/capex", label: "CAPEX / Plano Diretor" },
      { href: "/gestao/relatorios", label: "Relatórios" },
      { href: "/financeiro", label: "Financeiro" },
      { href: "/config", label: "Configurações" },
    ],
  },
  {
    key: "portal",
    label: "Portal",
    items: [
      { href: "/portal/abrir-solicitacao", label: "Abrir Solicitação" },
      { href: "/mobile", label: "App Campo (PWA)" },
    ],
  },
] as const;

export function SideRail() {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>("ops");
  const active = useMemo(() => pathname, [pathname]);

  return (
    <aside
      style={{
        width: 72,
        background: "var(--nexo-rail)",
        color: "white",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "14px 0",
        position: "relative",
        zIndex: 40,
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: "oklch(0.55 0.14 145)",
          display: "grid",
          placeItems: "center",
          fontWeight: 800,
          marginBottom: 18,
        }}
        title="Nexo"
      >
        N
      </div>

      {RAIL.map((group) => (
        <button
          key={group.key}
          type="button"
          onClick={() => setOpen((v) => (v === group.key ? null : group.key))}
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            border: "none",
            background: open === group.key ? "oklch(1 0 0 / 0.12)" : "transparent",
            color: "white",
            cursor: "pointer",
            marginBottom: 8,
            fontSize: 11,
            fontWeight: 700,
          }}
          title={group.label}
        >
          {group.label.slice(0, 3)}
        </button>
      ))}

      {open && (
        <div
          style={{
            position: "absolute",
            left: 72,
            top: 70,
            width: 250,
            background: "var(--nexo-surface)",
            color: "var(--nexo-text)",
            border: "1px solid var(--nexo-border)",
            borderRadius: 12,
            boxShadow: "0 18px 40px -24px rgba(0,0,0,.45)",
            padding: 10,
            maxHeight: "70vh",
            overflow: "auto",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--nexo-muted)", padding: "6px 8px" }}>
            {RAIL.find((g) => g.key === open)?.label}
          </div>
          {RAIL.find((g) => g.key === open)?.items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(null)}
              style={{
                display: "block",
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: active === item.href ? 700 : 500,
                background: active === item.href ? "oklch(0.96 0.02 250)" : "transparent",
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </aside>
  );
}
