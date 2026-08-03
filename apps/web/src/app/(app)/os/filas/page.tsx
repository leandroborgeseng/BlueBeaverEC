"use client";

import Link from "next/link";
import { OsFilasNav } from "@/components/os/OsFilasNav";
import { PageHeader, Surface } from "@/components/ui/aion-ui";

const CARDS = [
  {
    href: "/os/quadro-processos",
    title: "Quadro de processos",
    body: "Visão kanban por status. Use para acompanhar o fluxo e mover OS entre etapas.",
  },
  {
    href: "/os/triagem-solicitacoes",
    title: "Triagem de solicitações",
    body: "Entrada do portal do solicitante. Aprove (gera OS) ou recuse com justificativa.",
  },
  {
    href: "/os/nao-atribuidas",
    title: "Não atribuídas",
    body: "OS abertas sem técnico. Priorize atrasadas e distribua a equipe.",
  },
] as const;

export default function OsFilasHubPage() {
  return (
    <div>
      <PageHeader
        title="Filas de OS"
        subtitle="Três superfícies, um lugar — escolha a fila conforme a tarefa"
      />
      <OsFilasNav />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {CARDS.map((card) => (
          <Link key={card.href} href={card.href} style={{ textDecoration: "none", color: "inherit" }}>
            <Surface
              style={{
                height: "100%",
                transition: "background 0.12s",
              }}
            >
              <strong style={{ display: "block", fontSize: 15, marginBottom: 8 }}>{card.title}</strong>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: "oklch(0.45 0.02 250)" }}>
                {card.body}
              </p>
              <span
                style={{
                  display: "inline-block",
                  marginTop: 14,
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "oklch(0.45 0.14 255)",
                }}
              >
                Abrir →
              </span>
            </Surface>
          </Link>
        ))}
      </div>
    </div>
  );
}
