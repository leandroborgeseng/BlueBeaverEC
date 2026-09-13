import type { VisibilidadeOs } from "@aion/shared";

const ACOES_INTERNAS = new Set([
  "CHECKLIST_MOBILE",
  "FOTOS_MOBILE",
  "PECAS",
  "SERVICO_EXECUTADO",
  "DIAGNOSTICO",
  "ITEM_OS",
]);

export function visibilidadeLog(acao: string, explícita?: VisibilidadeOs): VisibilidadeOs {
  if (explícita) return explícita;
  return ACOES_INTERNAS.has(acao) ? "INTERNO" : "PUBLICO";
}

export function ehSolicitante(perfil?: string | null) {
  return perfil === "SOLICITANTE";
}

export function podeVerInterno(perfil?: string | null) {
  return !ehSolicitante(perfil);
}

export function filtrarTimeline<T extends { visibilidade?: VisibilidadeOs | null; acao?: string }>(
  itens: T[],
  perfil?: string | null,
): T[] {
  if (podeVerInterno(perfil)) return itens;
  return itens.filter((item) => {
    if (item.visibilidade === "INTERNO") return false;
    if (item.acao && ACOES_INTERNAS.has(item.acao)) return false;
    return true;
  });
}
