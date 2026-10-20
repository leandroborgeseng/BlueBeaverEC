/** Espelho de apps/api/src/laudos/padrao-regras.ts › camposObrigatoriosFaltando (a API é quem decide; isto só evita o ida-e-volta). */
export function camposObrigatoriosFaltando(p: {
  tipoAnalisador?: string | null;
  grandezas?: string[] | null;
  faixaMedicao?: string | null;
  resolucao?: string | null;
}): string[] {
  const falta: string[] = [];
  if (!p.tipoAnalisador?.trim()) falta.push("tipo de analisador");
  if (!(p.grandezas ?? []).some((g) => g?.trim())) falta.push("grandezas");
  if (!p.faixaMedicao?.trim()) falta.push("faixa de medição");
  if (!p.resolucao?.trim()) falta.push("resolução");
  return falta;
}
