"use client";

import { useId, type CSSProperties, type FormEvent, type ReactNode } from "react";

export type OsDialogCtx = {
  numero: number;
  codigo: string;
  statusLabel: string;
  alocacao: "INTERNA" | "EXTERNA";
  abertura?: string | null;
  setorNome: string;
  setorCodigo?: string;
  responsavelId?: string;
};

export const ORANGE = "#f58220";
export const YELLOW = "#fff4c2";
export const GRAY = "#e8e8e8";
export const BLUE = "#1a73e8";

export function Overlay({ onClose, children, fixed }: { onClose: () => void; children: ReactNode; fixed?: boolean }) {
  return (
    <div style={{ ...overlay, position: fixed ? "fixed" : "absolute", zIndex: fixed ? 80 : overlay.zIndex }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {children}
    </div>
  );
}

export function WinForm({
  title,
  children,
  onSubmit,
  onCancel,
  busy,
  continuar,
  setContinuar,
  erro,
  showContinuar = true,
  extraLeft,
  extraRight,
  submitLabel = "Salvar",
  cancelLabel = "Cancelar",
  onSubmitAndClose,
  submitAndCloseLabel = "Salvar e Fechar",
  hideSubmit,
  hideCancel,
  width,
}: {
  title: string;
  children: ReactNode;
  onSubmit?: (e: FormEvent) => void;
  onCancel: () => void;
  busy?: boolean;
  continuar?: boolean;
  setContinuar?: (v: boolean) => void;
  erro?: string | null;
  showContinuar?: boolean;
  extraLeft?: ReactNode;
  extraRight?: ReactNode;
  submitLabel?: string;
  cancelLabel?: string;
  onSubmitAndClose?: () => void;
  submitAndCloseLabel?: string;
  hideSubmit?: boolean;
  hideCancel?: boolean;
  width?: string;
}) {
  const inner = (
    <>
      <div style={titleBar}>
        <span style={{ color: ORANGE, fontWeight: 800, fontSize: 13 }}>{title}</span>
        <button type="button" onClick={onCancel} style={xBtn}>
          ×
        </button>
      </div>
      <div style={{ padding: "10px 14px 8px", background: GRAY, flex: 1, overflow: "auto" }}>
        {erro && <div style={{ color: "#a00", fontSize: 12, marginBottom: 8 }}>{erro}</div>}
        {children}
      </div>
      <div style={footer}>
        {extraLeft}
        {showContinuar && setContinuar && (
          <label style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={Boolean(continuar)} onChange={(e) => setContinuar(e.target.checked)} />
            Continuar Incluindo
          </label>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {extraRight}
          {!hideSubmit && onSubmit && (
            <button type="submit" disabled={busy} style={saveBtn}>
              {busy ? "Salvando…" : submitLabel}
            </button>
          )}
          {onSubmitAndClose && (
            <button type="button" disabled={busy} style={saveBtn} onClick={onSubmitAndClose}>
              {busy ? "Salvando…" : submitAndCloseLabel}
            </button>
          )}
          {!hideCancel && (
            <button type="button" onClick={onCancel} style={cancelBtn}>
              {cancelLabel}
            </button>
          )}
        </div>
      </div>
    </>
  );

  if (onSubmit) {
    return (
      <form onSubmit={onSubmit} style={{ ...dialog, width: width ?? dialog.width }} onMouseDown={(e) => e.stopPropagation()}>
        {inner}
      </form>
    );
  }
  return (
    <div style={{ ...dialog, width: width ?? dialog.width }} onMouseDown={(e) => e.stopPropagation()}>
      {inner}
    </div>
  );
}

export function Cabecalho({ ctx, numeroLabel = "Número da OS:" }: { ctx: OsDialogCtx; numeroLabel?: string }) {
  const status = `OS ${ctx.statusLabel} - ${ctx.alocacao === "EXTERNA" ? "Externa" : "Interna"}`;
  const { data, hora } = splitAbertura(ctx.abertura);
  return (
    <div style={{ marginBottom: 10, fontSize: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={lab}>{numeroLabel}</span>
        <strong>{ctx.codigo.replace(/^OS-/, "")}</strong>
        <span style={{ color: "#1a5fb4", fontWeight: 700, marginLeft: 8 }}>{status}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "baseline" }}>
          Data/Hora de Abertura:
          <strong>{data}</strong>
          <strong>{hora}</strong>
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
        <span style={lab}>Setor/Cliente:</span>
        <span style={{ width: 44, background: YELLOW, border: "1px solid #ccc", padding: "2px 6px", minHeight: 22 }}>
          {ctx.setorCodigo || ""}
        </span>
        <span style={{ flex: 1, background: "#d9d9d9", border: "1px solid #ccc", padding: "2px 8px" }}>{ctx.setorNome}</span>
      </div>
    </div>
  );
}

export function Linha({
  label,
  children,
  align,
  labelWidth,
}: {
  label: string;
  children: ReactNode;
  align?: "start";
  labelWidth?: number;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: align === "start" ? "flex-start" : "center", marginBottom: 6 }}>
      <span style={{ ...lab, width: labelWidth ?? lab.width, paddingTop: align === "start" ? 4 : 0 }}>{label}</span>
      {children}
    </div>
  );
}

export function Combo({
  value,
  onChange,
  options,
  yellow,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  yellow?: boolean;
  width?: number | string;
}) {
  const id = useId();
  return (
    <div style={{ display: "flex", flex: width ? undefined : 1, width, minWidth: 0 }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={id}
        style={{ ...fld, flex: 1, background: yellow ? YELLOW : "white", borderRight: "none" }}
      />
      <button type="button" tabIndex={-1} style={comboBtn} title="Lista">
        ▼
      </button>
      <datalist id={id}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </div>
  );
}

export function DateHora({
  date,
  time,
  onDate,
  onTime,
  yellow,
}: {
  date: string;
  time: string;
  onDate: (v: string) => void;
  onTime: (v: string) => void;
  yellow?: boolean;
}) {
  const bg = yellow ? YELLOW : "white";
  return (
    <>
      <input type="date" value={date} onChange={(e) => onDate(e.target.value)} style={{ ...fld, width: 130, background: bg }} />
      <input type="time" value={time} onChange={(e) => onTime(e.target.value)} style={{ ...fld, width: 78, background: bg, marginLeft: 4 }} />
    </>
  );
}

export function Historico({ titulo, count, children }: { titulo: string; count: number; children: ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span>{titulo}</span>
        <span>Exibindo {String(count).padStart(4, "0")} registros</span>
      </div>
      <div style={{ background: "white", border: "1px solid #bbb", minHeight: 88, maxHeight: 160, overflow: "auto" }}>{children}</div>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: "#333", margin: "10px 0 6px", letterSpacing: 0.2 }}>{children}</div>
  );
}

export function BlueBtn({ children, onClick, type = "button" }: { children: ReactNode; onClick?: () => void; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        background: BLUE,
        color: "white",
        border: "none",
        borderRadius: 3,
        padding: "4px 12px",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export function isoDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isoTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmt(v?: string | null) {
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function splitAbertura(v?: string | null) {
  if (!v) return { data: "", hora: "" };
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return { data: fmt(v), hora: "" };
  return {
    data: d.toLocaleDateString("pt-BR"),
    hora: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

const overlay: CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(40,40,40,0.25)",
  zIndex: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 12,
};

const dialog: CSSProperties = {
  width: "min(1040px, 100%)",
  maxHeight: "100%",
  background: GRAY,
  border: "1px solid #999",
  boxShadow: "4px 6px 18px rgba(0,0,0,0.25)",
  display: "flex",
  flexDirection: "column",
};

const titleBar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "6px 10px",
  background: "linear-gradient(#f7f7f7,#e4e4e4)",
  borderBottom: "1px solid #ccc",
};

const xBtn: CSSProperties = {
  marginLeft: "auto",
  width: 22,
  height: 22,
  border: "1px solid #bbb",
  background: "white",
  cursor: "pointer",
};

const footer: CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "8px 12px",
  borderTop: "1px solid #ccc",
  background: "#f3f3f3",
  gap: 10,
};

export const lab: CSSProperties = { width: 168, textAlign: "right", fontSize: 12, flexShrink: 0 };
export const fld: CSSProperties = {
  height: 24,
  border: "1px solid #aaa",
  fontSize: 12,
  padding: "0 6px",
  background: "white",
};
const comboBtn: CSSProperties = {
  width: 22,
  height: 24,
  border: "1px solid #aaa",
  background: "#f0f0f0",
  fontSize: 9,
  cursor: "default",
  flexShrink: 0,
};
export const radio: CSSProperties = { display: "flex", gap: 4, alignItems: "center", fontSize: 12, marginLeft: 10 };
export const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 11 };
export const th: CSSProperties = { background: "#8a8a8a", color: "white", textAlign: "left", padding: "4px 6px", fontWeight: 600 };
export const td: CSSProperties = { padding: "4px 6px", borderBottom: "1px solid #eee" };
export const saveBtn: CSSProperties = {
  background: "#e8e8e8",
  border: "1px solid #888",
  padding: "5px 14px",
  fontSize: 12,
  cursor: "pointer",
};
export const cancelBtn: CSSProperties = { ...saveBtn };
export const disabledFld: CSSProperties = { ...fld, background: "#ddd" };
