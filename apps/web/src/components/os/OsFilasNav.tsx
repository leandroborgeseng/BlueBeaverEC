"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: Array<{ href: string; label: string; hint: string }> = [
  {
    href: "/os/filas",
    label: "Visão geral",
    hint: "Quando usar cada fila",
  },
  {
    href: "/os/quadro-processos",
    label: "Quadro",
    hint: "Acompanhar status em colunas",
  },
  {
    href: "/os/triagem-solicitacoes",
    label: "Triagem",
    hint: "Aprovar ou recusar solicitações",
  },
  {
    href: "/os/nao-atribuidas",
    label: "Não atribuídas",
    hint: "Distribuir OS sem responsável",
  },
];

const FILA_PATHS = new Set(TABS.map((t) => t.href));

export function isOsFilaPath(pathname: string) {
  return FILA_PATHS.has(pathname);
}

export function OsFilasNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Filas de ordens de serviço"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginBottom: 18,
        padding: 4,
        background: "oklch(0.965 0.008 250)",
        borderRadius: 10,
        border: "1px solid oklch(0.91 0.01 250)",
      }}
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            title={tab.hint}
            aria-current={active ? "page" : undefined}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: active ? 700 : 500,
              textDecoration: "none",
              color: active ? "oklch(0.35 0.12 255)" : "oklch(0.4 0.02 250)",
              background: active ? "white" : "transparent",
              border: active ? "1px solid oklch(0.88 0.02 255)" : "1px solid transparent",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
