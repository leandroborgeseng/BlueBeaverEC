"use client";

import { useEffect, useState } from "react";
import { formatarSlaMinutos } from "@aion/shared";

export type SlaChipProps = {
  slaLimite?: string | Date | null;
  slaEstourado?: boolean;
  slaMinutosRestantes?: number;
  status?: string;
};

function tomSla(mins: number): "late" | "warn" | "ok" {
  if (mins < 0) return "late";
  if (mins <= 120) return "warn";
  return "ok";
}

const CORES: Record<"late" | "warn" | "ok", { bg: string; color: string }> = {
  late: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
  warn: { bg: "oklch(0.95 0.05 85)", color: "oklch(0.45 0.12 75)" },
  ok: { bg: "oklch(0.94 0.05 150)", color: "oklch(0.4 0.12 150)" },
};

export function SlaChip({ slaLimite, status }: SlaChipProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (!slaLimite) return null;
  if (status === "CONCLUIDA" || status === "CANCELADA") return null;

  const mins = Math.round((new Date(slaLimite).getTime() - now) / 60_000);
  const tom = tomSla(mins);
  const tempo = formatarSlaMinutos(mins);
  const label = mins < 0 ? `atraso ${tempo}` : `falta ${tempo}`;
  const style = CORES[tom];

  return (
    <span
      title={new Date(slaLimite).toLocaleString("pt-BR")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 700,
        background: style.bg,
        color: style.color,
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      SLA {label}
    </span>
  );
}
