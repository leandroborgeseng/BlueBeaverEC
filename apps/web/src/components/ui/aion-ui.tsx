"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 22,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <h1
          style={{
            margin: "0 0 2px",
            fontSize: 21,
            fontWeight: 700,
            letterSpacing: "-0.015em",
            color: "oklch(0.18 0.015 255)",
          }}
        >
          {title}
        </h1>
        {subtitle != null && (
          <div style={{ margin: 0, color: "oklch(0.5 0.02 250)", fontSize: 13.5, lineHeight: 1.4 }}>
            {subtitle}
          </div>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{actions}</div>}
    </div>
  );
}

export function Surface({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: CSSProperties;
  padded?: boolean;
}) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid oklch(0.91 0.006 255)",
        borderRadius: 10,
        boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
        padding: padded ? "16px 18px" : 0,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Surface style={{ padding: 20 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <strong style={{ fontSize: 15, fontWeight: 700, color: "oklch(0.2 0.02 250)" }}>{title}</strong>
        {action}
      </div>
      {children}
    </Surface>
  );
}

const TONE_RING: Record<string, string> = {
  neutral: "oklch(0.82 0.02 250)",
  danger: "oklch(0.58 0.19 25)",
  success: "oklch(0.55 0.14 150)",
  warning: "oklch(0.65 0.15 85)",
  info: "oklch(0.55 0.16 255)",
};

export function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
  ringPct,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "danger" | "success" | "warning" | "info";
  /** Só exibe anel quando for métrica real 0–100 (sem default decorativo). */
  ringPct?: number;
}) {
  const ringColor = TONE_RING[tone] ?? TONE_RING.neutral;
  const showRing = typeof ringPct === "number" && Number.isFinite(ringPct);
  const pct = showRing ? Math.max(0, Math.min(100, ringPct)) : 0;
  return (
    <Surface
      style={{
        padding: "18px 20px",
        display: "flex",
        gap: 16,
        alignItems: "center",
      }}
    >
      {showRing && (
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            flexShrink: 0,
            background: `conic-gradient(${ringColor} ${pct * 3.6}deg, oklch(0.94 0.003 255) 0deg)`,
            display: "grid",
            placeItems: "center",
          }}
          aria-hidden
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "white",
              fontSize: 11,
              fontWeight: 700,
              display: "grid",
              placeItems: "center",
              color: ringColor,
            }}
          >
            {Math.round(pct)}%
          </div>
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "oklch(0.5 0.02 250)", marginBottom: 2 }}>{label}</div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 1.1,
            color: "oklch(0.2 0.02 250)",
          }}
        >
          {value}
        </div>
        {hint != null && (
          <div
            style={{
              marginTop: 4,
              fontSize: 12,
              fontWeight: 600,
              color:
                tone === "danger"
                  ? "oklch(0.5 0.17 25)"
                  : tone === "success"
                    ? "oklch(0.45 0.13 150)"
                    : "oklch(0.5 0.02 250)",
            }}
          >
            {hint}
          </div>
        )}
      </div>
    </Surface>
  );
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  ABERTA: { bg: "oklch(0.93 0.04 250)", color: "oklch(0.4 0.14 255)" },
  EM_ANDAMENTO: { bg: "oklch(0.95 0.05 85)", color: "oklch(0.45 0.12 75)" },
  AGUARDANDO_PECA: { bg: "oklch(0.94 0.05 300)", color: "oklch(0.42 0.12 300)" },
  ATRASADA: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
  CONCLUIDA: { bg: "oklch(0.94 0.05 150)", color: "oklch(0.4 0.12 150)" },
  CANCELADA: { bg: "oklch(0.94 0.01 250)", color: "oklch(0.45 0.02 250)" },
  ATIVO: { bg: "oklch(0.94 0.05 150)", color: "oklch(0.4 0.12 150)" },
  EM_GARANTIA: { bg: "oklch(0.93 0.04 250)", color: "oklch(0.4 0.14 255)" },
  EM_GARANTIA_ESTENDIDA: { bg: "oklch(0.93 0.04 250)", color: "oklch(0.4 0.14 255)" },
  INATIVO: { bg: "oklch(0.94 0.01 250)", color: "oklch(0.45 0.02 250)" },
  ALTA: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
  MEDIA: { bg: "oklch(0.95 0.05 85)", color: "oklch(0.45 0.12 75)" },
  BAIXA: { bg: "oklch(0.94 0.01 250)", color: "oklch(0.45 0.02 250)" },
  URGENTE: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
  VENCIDO: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
  A_VENCER: { bg: "oklch(0.95 0.05 85)", color: "oklch(0.45 0.12 75)" },
  VALIDO: { bg: "oklch(0.94 0.05 150)", color: "oklch(0.4 0.12 150)" },
  VIGENTE: { bg: "oklch(0.94 0.05 150)", color: "oklch(0.4 0.12 150)" },
  PENDENTE: { bg: "oklch(0.95 0.05 85)", color: "oklch(0.45 0.12 75)" },
  APROVADA: { bg: "oklch(0.94 0.05 150)", color: "oklch(0.4 0.12 150)" },
  RECUSADA: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
  FECHADA: { bg: "oklch(0.94 0.01 250)", color: "oklch(0.45 0.02 250)" },
  PLANEJADA: { bg: "oklch(0.93 0.04 250)", color: "oklch(0.4 0.14 255)" },
  EM_EXECUCAO: { bg: "oklch(0.95 0.05 85)", color: "oklch(0.45 0.12 75)" },
  CONFORME: { bg: "oklch(0.94 0.05 150)", color: "oklch(0.4 0.12 150)" },
  PARCIAL: { bg: "oklch(0.95 0.05 85)", color: "oklch(0.45 0.12 75)" },
  NAO_CONFORME: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
  SOBRECARGA: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
};

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const key = String(tone ?? children)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "_");
  const s = STATUS_STYLES[key] ?? { bg: "oklch(0.95 0.01 250)", color: "oklch(0.35 0.02 250)" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 9px",
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function PriorityBar({ prioridade }: { prioridade: string }) {
  const p = prioridade.toUpperCase();
  const color =
    p === "ALTA" || p === "URGENTE"
      ? "oklch(0.55 0.18 25)"
      : p === "MEDIA"
        ? "oklch(0.75 0.14 85)"
        : "oklch(0.75 0.01 250)";
  return (
    <span
      style={{
        display: "inline-block",
        width: 4,
        height: 28,
        borderRadius: 2,
        background: color,
        marginRight: 8,
        verticalAlign: "middle",
      }}
    />
  );
}

export function Btn({
  children,
  variant = "primary",
  href,
  onClick,
  type = "button",
  disabled,
  style,
  size = "md",
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  style?: CSSProperties;
  size?: "md" | "sm";
}) {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 7,
    padding: size === "sm" ? "8px 14px" : "9px 16px",
    fontSize: size === "sm" ? 12.5 : 13.5,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    textDecoration: "none",
    border: "1px solid transparent",
    boxShadow: variant === "primary" ? "0 1px 2px rgba(16,24,40,0.08)" : undefined,
    ...style,
  };
  const variants: Record<string, CSSProperties> = {
    primary: { background: "oklch(0.64 0.19 38)", color: "white", borderColor: "oklch(0.64 0.19 38)" },
    secondary: {
      background: "white",
      color: "oklch(0.64 0.19 38)",
      borderColor: "oklch(0.64 0.19 38)",
    },
    ghost: {
      background: "white",
      color: "oklch(0.4 0.02 250)",
      borderColor: "oklch(0.9 0.005 250)",
    },
    danger: { background: "oklch(0.45 0.15 25)", color: "white", borderColor: "oklch(0.45 0.15 25)" },
  };
  const s = { ...base, ...variants[variant] };
  if (href) {
    return (
      <Link href={href} style={s}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={s}>
      {children}
    </button>
  );
}

export const fieldStyle: CSSProperties = {
  width: "100%",
  border: "1px solid oklch(0.88 0.01 250)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  background: "white",
  color: "oklch(0.28 0.02 250)",
};

/** Campos de formulário de página (mais confortáveis que filtros). */
export const formFieldStyle: CSSProperties = {
  ...fieldStyle,
  padding: "10px 12px",
  fontSize: 13.5,
  borderRadius: 8,
};

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block",
        fontSize: 11.5,
        fontWeight: 600,
        color: "oklch(0.5 0.02 250)",
        marginBottom: 5,
      }}
    >
      {children}
    </label>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <Surface
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 12,
        marginBottom: 16,
        alignItems: "end",
        padding: "16px 18px",
      }}
    >
      {children}
    </Surface>
  );
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <Surface padded={false}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>{children}</table>
    </Surface>
  );
}

export const th: CSSProperties = {
  padding: "11px 18px",
  fontSize: 10.5,
  fontWeight: 600,
  color: "oklch(0.48 0.015 255)",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  background: "oklch(0.975 0.004 255)",
  borderBottom: "1px solid oklch(0.93 0.005 255)",
  textAlign: "left",
};

export const td: CSSProperties = {
  padding: "12px 18px",
  borderTop: "1px solid oklch(0.945 0.004 255)",
  verticalAlign: "middle",
};

export function Empty({ text = "Nenhum registro encontrado." }: { text?: string }) {
  return (
    <div style={{ padding: "28px 12px", textAlign: "center", color: "oklch(0.55 0.02 250)", fontSize: 13 }}>
      {text}
    </div>
  );
}

export function Loading({ text = "Carregando…" }: { text?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        padding: "36px 12px",
        textAlign: "center",
        color: "oklch(0.5 0.02 250)",
        fontSize: 13.5,
        fontWeight: 600,
      }}
    >
      {text}
    </div>
  );
}

export function Err({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        marginBottom: 12,
        padding: "10px 12px",
        borderRadius: 8,
        background: "oklch(0.96 0.03 25)",
        color: "oklch(0.45 0.15 25)",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

export function ResultCount({ n }: { n: number }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 600, color: "oklch(0.5 0.02 250)", margin: "0 0 10px" }}>
      {n} resultado(s)
    </div>
  );
}
