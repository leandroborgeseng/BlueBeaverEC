"use client";

import { useEffect, useState } from "react";
import { formatarSlaMinutos, minutosUteisEntre } from "@aion/shared";

export type SlaChipProps = {
  slaLimite?: string | Date | null;
  slaEstourado?: boolean;
  slaMinutosRestantes?: number;
  status?: string;
};

function tomSla(atrasado: boolean, mins: number): "late" | "warn" | "ok" {
  if (atrasado) return "late";
  if (mins <= 120) return "warn";
  return "ok";
}

const CORES: Record<"late" | "warn" | "ok", { bg: string; color: string }> = {
  late: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
  warn: { bg: "oklch(0.95 0.05 85)", color: "oklch(0.45 0.12 75)" },
  ok: { bg: "oklch(0.94 0.05 150)", color: "oklch(0.4 0.12 150)" },
};

export function SlaChip({ slaLimite, slaEstourado, status }: SlaChipProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (!slaLimite) return null;
  if (status === "CONCLUIDA" || status === "CANCELADA") return null;

  const limite = new Date(slaLimite);
  const mins = minutosUteisEntre(now, limite);
  const atrasado = slaEstourado ?? now > limite.getTime();
  const tom = tomSla(atrasado, mins);
  const tempo = formatarSlaMinutos(mins);
  const label = atrasado ? (mins >= 0 ? "atrasado" : `atraso ${tempo}`) : `falta ${tempo}`;
  const style = CORES[tom];

  return (
    <span
      title={`${limite.toLocaleString("pt-BR")} · horas úteis seg–sex 8h–17h`}
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
