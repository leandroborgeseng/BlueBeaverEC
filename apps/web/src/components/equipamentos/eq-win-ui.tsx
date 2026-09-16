"use client";

import { type CSSProperties, type ReactNode } from "react";

export const ORANGE = "var(--aion-primary)";
export const ROW_STRIPE = "#e8eef5";
export const ROW_SEL = "#c5d4ea";
export const GRAY = "#ececec";
export const HEADER_BG = "#7a7a7a";

export function padCount(n: number) {
  return String(n).padStart(4, "0");
}

export function WinScreen({
  title,
  toolbar,
  filters,
  footer,
  error,
  children,
}: {
  title: string;
  toolbar?: ReactNode;
  filters?: ReactNode;
  footer?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div style={shell}>
      <div style={titleBar}>
        <span style={{ color: ORANGE, fontWeight: 800, fontSize: 14, letterSpacing: 0.2 }}>{title}</span>
      </div>
      {toolbar ? <div style={toolbarBar}>{toolbar}</div> : null}
      {filters ? <div style={filterPanel}>{filters}</div> : null}
      {error ? <div style={errorBar}>{error}</div> : null}
      <div style={{ flex: 1, overflow: "auto", background: "white", minHeight: 180 }}>{children}</div>
      {footer ? <div style={footerBar}>{footer}</div> : null}
    </div>
  );
}

export function ToolBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} style={toolBtn(Boolean(disabled))}>
      {children}
    </button>
  );
}

export function FRow({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>{children}</div>;
}

export function FItem({
  label,
  children,
  labelWidth = 92,
  grow,
}: {
  label: string;
  children: ReactNode;
  labelWidth?: number;
  grow?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: grow ? 1 : undefined, minWidth: grow ? 180 : undefined }}>
      <span style={{ width: labelWidth, textAlign: "right", fontSize: 12, flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}

export const winFld: CSSProperties = {
  height: 22,
  border: "1px solid #aaa",
  fontSize: 12,
  padding: "0 6px",
  background: "white",
  minWidth: 0,
};

export function ZebraTable({
  columns,
  children,
}: {
  columns: Array<{ key: string; label: string; width?: number | string }>;
  children: ReactNode;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              style={{
                ...th,
                width: c.width,
                whiteSpace: "nowrap",
              }}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export function zebraRow(index: number, selected: boolean, extra?: CSSProperties): CSSProperties {
  return {
    background: selected ? ROW_SEL : index % 2 === 1 ? ROW_STRIPE : "#fff",
    cursor: "pointer",
    color: "#222",
    ...extra,
  };
}

export const td: CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid #f0f0f0",
  whiteSpace: "nowrap",
};

const shell: CSSProperties = {
  background: GRAY,
  border: "1px solid #c8c8c8",
  display: "flex",
  flexDirection: "column",
  minHeight: "calc(100vh - 140px)",
  boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
};

const titleBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "7px 12px",
  background: "linear-gradient(#fafafa,#e8e8e8)",
  borderBottom: "1px solid #ccc",
};

const toolbarBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 2,
  padding: "4px 8px",
  background: "#f3f3f3",
  borderBottom: "1px solid #d0d0d0",
  flexWrap: "wrap",
};

const filterPanel: CSSProperties = {
  padding: "10px 14px 8px",
  background: "#e6e6e6",
  borderBottom: "1px solid #ccc",
};

const footerBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "6px 12px",
  borderTop: "1px solid #ccc",
  background: "#f7f7f7",
  fontSize: 12,
};

const errorBar: CSSProperties = {
  color: "#a00",
  fontSize: 12,
  padding: "6px 12px",
  background: "#fde8e8",
};

function toolBtn(disabled: boolean): CSSProperties {
  return {
    border: "1px solid transparent",
    background: "transparent",
    padding: "4px 10px",
    fontSize: 12,
    cursor: disabled ? "default" : "pointer",
    color: disabled ? "#999" : "#333",
    borderRadius: 2,
  };
}

const th: CSSProperties = {
  background: HEADER_BG,
  color: "white",
  textAlign: "left",
  padding: "5px 8px",
  fontWeight: 600,
  position: "sticky",
  top: 0,
  zIndex: 1,
};
