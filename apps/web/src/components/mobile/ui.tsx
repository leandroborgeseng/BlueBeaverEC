"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { IconCheck, IconChevron } from "./icons";

export const M = {
  bg: "var(--aion-bg-mobile)",
  surface: "var(--aion-surface)",
  border: "var(--aion-border-soft)",
  text: "var(--aion-text)",
  title: "var(--aion-text-title)",
  muted: "var(--aion-muted)",
  primary: "var(--aion-primary)",
  brand: "var(--aion-brand)",
  link: "var(--aion-link)",
  success: "var(--aion-success)",
  danger: "var(--aion-danger)",
  warning: "var(--aion-warning)",
} as const;

export const PRIO_TONE: Record<string, { bg: string; color: string; label: string }> = {
  URGENTE: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)", label: "Urgente" },
  ALTA: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)", label: "Alta" },
  PARADA_CRITICA: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)", label: "Crítica" },
  MEDIA: { bg: "oklch(0.95 0.05 85)", color: "oklch(0.45 0.12 75)", label: "Média" },
  BAIXA: { bg: "oklch(0.94 0.01 250)", color: "oklch(0.45 0.02 250)", label: "Baixa" },
};

export const STATUS_TONE: Record<string, { bg: string; color: string }> = {
  ABERTA: { bg: "oklch(0.93 0.04 250)", color: "oklch(0.4 0.14 255)" },
  EM_ANDAMENTO: { bg: "oklch(0.95 0.05 85)", color: "oklch(0.45 0.12 75)" },
  NAO_ATRIBUIDA: { bg: "oklch(0.94 0.01 250)", color: "oklch(0.45 0.02 250)" },
  CONCLUIDA: { bg: "oklch(0.94 0.05 150)", color: "oklch(0.4 0.12 150)" },
  CANCELADA: { bg: "oklch(0.94 0.01 250)", color: "oklch(0.45 0.02 250)" },
  ATRASADA: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
  PENDENTE: { bg: "oklch(0.95 0.05 85)", color: "oklch(0.45 0.12 75)" },
  CONVERTIDA: { bg: "oklch(0.94 0.05 150)", color: "oklch(0.4 0.12 150)" },
  RECUSADA: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
  SEM_VALIDADE: { bg: "oklch(0.94 0.01 250)", color: "oklch(0.45 0.02 250)" },
  VENCIDO: { bg: "oklch(0.94 0.05 25)", color: "oklch(0.45 0.16 25)" },
  A_VENCER: { bg: "oklch(0.95 0.05 85)", color: "oklch(0.45 0.12 75)" },
  VALIDO: { bg: "oklch(0.94 0.05 150)", color: "oklch(0.4 0.12 150)" },
};

export function tonePrio(v?: string) {
  return PRIO_TONE[v ?? ""] ?? PRIO_TONE.MEDIA;
}

export function toneStatus(v?: string) {
  return STATUS_TONE[v ?? ""] ?? STATUS_TONE.ABERTA;
}

export function statusLabel(v: string) {
  return v.replaceAll("_", " ");
}

export const cardStyle: CSSProperties = {
  background: "white",
  border: `1px solid ${M.border}`,
  borderRadius: 14,
  padding: 14,
};

export const fieldStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--aion-border)",
  borderRadius: 12,
  padding: "12px 14px",
  background: "white",
  fontSize: 15,
  fontWeight: 600,
  color: M.text,
};

export function Chip({
  children,
  bg,
  color,
}: {
  children: ReactNode;
  bg: string;
  color: string;
}) {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        padding: "3px 8px",
        borderRadius: 5,
        background: bg,
        color,
        whiteSpace: "nowrap",
        letterSpacing: "0.01em",
      }}
    >
      {children}
    </span>
  );
}

export function PrioChip({ value }: { value: string }) {
  const t = tonePrio(value);
  return <Chip bg={t.bg} color={t.color}>{t.label.toUpperCase()}</Chip>;
}

export function StatusChip({ value, atrasada }: { value: string; atrasada?: boolean }) {
  const key = atrasada ? "ATRASADA" : value;
  const t = toneStatus(key);
  return <Chip bg={t.bg} color={t.color}>{statusLabel(atrasada ? "ATRASADA" : value)}</Chip>;
}

export function SectionTitle({
  children,
  href,
  action = "Ver todas ›",
}: {
  children: ReactNode;
  href?: string;
  action?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: "oklch(0.2 0.02 250)" }}>{children}</div>
      {href && (
        <Link href={href} style={{ fontSize: 12, fontWeight: 600, color: M.link, textDecoration: "none" }}>
          {action}
        </Link>
      )}
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: subtitle ? 14 : 16 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: M.title, letterSpacing: "-0.02em" }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: 13, color: M.muted, marginTop: 2, fontWeight: 550 }}>{subtitle}</div>
      )}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: M.muted,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  href?: string;
}) {
  const style: CSSProperties = {
    width: "100%",
    border: "none",
    borderRadius: 12,
    padding: 14,
    background: M.primary,
    color: "white",
    fontWeight: 800,
    fontSize: 15,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "block",
    textAlign: "center",
    textDecoration: "none",
    boxSizing: "border-box",
  };
  if (href && !disabled) {
    return (
      <Link href={href} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={style}>
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  onClick,
  disabled,
  href,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  href?: string;
}) {
  const style: CSSProperties = {
    width: "100%",
    border: `1px solid ${M.border}`,
    borderRadius: 12,
    padding: 14,
    background: "white",
    color: M.text,
    fontWeight: 800,
    fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer",
    display: "block",
    textAlign: "center",
    textDecoration: "none",
    boxSizing: "border-box",
  };
  if (href && !disabled) {
    return (
      <Link href={href} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={style}>
      {children}
    </button>
  );
}

export function MiniKpi({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ ...cardStyle, padding: "12px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: "-0.03em" }}>{value}</div>
      <div style={{ fontSize: 10.5, color: M.muted, fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        ...cardStyle,
        textAlign: "center",
        padding: "28px 18px",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: "oklch(0.96 0.01 255)",
          margin: "0 auto 12px",
          display: "grid",
          placeItems: "center",
        }}
      >
        <IconCheck size={18} color={M.muted} stroke={2} />
      </div>
      <div style={{ fontWeight: 800, fontSize: 14.5, color: M.title }}>{title}</div>
      {hint && (
        <div style={{ fontSize: 13, color: M.muted, marginTop: 6, lineHeight: 1.4 }}>{hint}</div>
      )}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            ...cardStyle,
            height: 76,
            background: "linear-gradient(90deg, oklch(0.96 0.005 255) 0%, oklch(0.99 0 0) 50%, oklch(0.96 0.005 255) 100%)",
            backgroundSize: "200% 100%",
            animation: "aion-shimmer 1.2s ease-in-out infinite",
            border: `1px solid ${M.border}`,
          }}
        />
      ))}
    </div>
  );
}

export function FilterPills<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ id: T; label: string; count?: number }>;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              padding: "6px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              background: active ? M.primary : "white",
              color: active ? "white" : "oklch(0.35 0.02 250)",
              border: `1px solid ${active ? M.primary : M.border}`,
            }}
          >
            {o.label}
            {o.count != null && o.count > 0 ? ` (${o.count})` : ""}
          </button>
        );
      })}
    </div>
  );
}

export function ListCard({
  href,
  title,
  subtitle,
  trailing,
  icon,
  iconBg,
  iconColor,
}: {
  href?: string;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  icon?: ReactNode;
  iconBg?: string;
  iconColor?: string;
}) {
  const inner = (
    <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
      {icon && (
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 9,
            background: iconBg ?? "oklch(0.95 0.02 255)",
            color: iconColor ?? M.brand,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
          }}
        >
          {icon}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 700,
            color: "oklch(0.22 0.02 250)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11.5, color: "oklch(0.55 0.02 250)", marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      {trailing ?? <IconChevron size={16} color="oklch(0.7 0.02 250)" />}
    </div>
  );

  if (!href) {
    return <div style={cardStyle}>{inner}</div>;
  }

  return (
    <Link href={href} style={{ ...cardStyle, display: "block", textDecoration: "none", color: "inherit" }}>
      {inner}
    </Link>
  );
}

export function Banner({
  tone = "success",
  children,
}: {
  tone?: "success" | "danger" | "info";
  children: ReactNode;
}) {
  const map = {
    success: { bg: "oklch(0.94 0.05 150)", color: "oklch(0.35 0.1 145)" },
    danger: { bg: "oklch(0.96 0.03 25)", color: "oklch(0.45 0.15 25)" },
    info: { bg: "oklch(0.95 0.02 255)", color: "oklch(0.4 0.12 255)" },
  }[tone];
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 12,
        background: map.bg,
        color: map.color,
        fontWeight: 700,
        fontSize: 13,
        lineHeight: 1.35,
      }}
    >
      {children}
    </div>
  );
}

export function HeroAction({
  href,
  icon,
  title,
  subtitle,
  accent = "oklch(0.55 0.16 255)",
  accentBg = "oklch(0.95 0.02 255)",
}: {
  href: string;
  icon: ReactNode;
  title: string;
  subtitle: string;
  accent?: string;
  accentBg?: string;
}) {
  return (
    <Link
      href={href}
      style={{
        ...cardStyle,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: 16,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          background: accentBg,
          color: accent,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: M.muted, marginTop: 3, lineHeight: 1.35 }}>{subtitle}</div>
      </div>
      <IconChevron size={18} color="oklch(0.72 0.02 250)" />
    </Link>
  );
}

export function QuickCard({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        ...cardStyle,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      {icon}
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "oklch(0.28 0.02 250)", lineHeight: 1.3 }}>
        {label}
      </span>
    </Link>
  );
}

export function saudacaoNow() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia,";
  if (h < 18) return "Boa tarde,";
  return "Boa noite,";
}

export function firstName(nome?: string | null) {
  return nome?.split(" ")[0] || "Olá";
}
