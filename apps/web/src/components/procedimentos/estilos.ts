import type { CSSProperties } from "react";

/** Tokens T-AA: --aion-border-control (≥ 3:1), --aion-primary (texto branco 4,67:1), --aion-focus-ring. */
export const BORDA_FORTE = "var(--aion-border-control)";
export const TEXTO = "var(--aion-text, oklch(0.25 0.02 250))";
export const TEXTO_SUAVE = "oklch(0.42 0.02 250)";
export const FOCO = "var(--aion-focus-ring)";

export const alvo44: CSSProperties = { minWidth: 44, minHeight: 44 };

export const campo: CSSProperties = {
  width: "100%",
  minHeight: 44,
  border: `1px solid ${BORDA_FORTE}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  color: TEXTO,
  background: "white",
};

export const botao = (tipo: "primario" | "secundario" | "perigo" = "secundario", desabilitado = false): CSSProperties => ({
  ...alvo44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 14px",
  borderRadius: 7,
  fontSize: 14,
  fontWeight: 600,
  cursor: desabilitado ? "not-allowed" : "pointer",
  opacity: desabilitado ? 0.65 : 1,
  // primário T-AA: --aion-primary com texto branco = 4,67:1
  background: tipo === "primario" ? "var(--aion-primary)" : tipo === "perigo" ? "var(--aion-danger)" : "white",
  color: tipo === "secundario" ? TEXTO : "white",
  border: `1px solid ${tipo === "secundario" ? BORDA_FORTE : "transparent"}`,
});

export const rotulo: CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: TEXTO, marginBottom: 4 };
export const ajuda: CSSProperties = { fontSize: 12.5, color: TEXTO_SUAVE, marginTop: 4 };
export const grade: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 12 };
