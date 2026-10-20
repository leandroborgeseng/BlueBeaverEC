/**
 * Regras puras de padrões rastreáveis (E1 — laudos v2, critérios 1 a 4).
 * Sem acesso a banco: testáveis com `tsx --test`.
 */
import { dataCivilDeData, dataCivilDeInstante, diasCivisEntre } from "@aion/shared";
import { statusCertificadoNaData, type StatusCertificadoNaData } from "./laudo-regras";

export const DIAS_ALERTA_PADRAO = 60;

/** Dias civis (America/Sao_Paulo) de hoje até a validade; 0 = vence hoje, negativo = vencido. */
export function diasAteValidade(validade: Date | string | null, agora: Date = new Date()): number | null {
  const v = dataCivilDeData(validade);
  const h = dataCivilDeInstante(agora);
  return v && h ? diasCivisEntre(h, v) : null;
}

/** nº de série normalizado para a regra de unicidade por estabelecimento (crit. 1). */
export function normalizarNSerie(nSerie: string | null | undefined): string {
  return (nSerie ?? "").trim().replace(/\s+/g, " ");
}

/** Janela de alerta válida: inteiro 1..365; senão usa o padrão de 60 dias (crit. 3). */
export function janelaAlerta(dias: number | null | undefined): number {
  const n = Number(dias);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 365) return DIAS_ALERTA_PADRAO;
  return n;
}

export type CertificadoPadraoValidavel = {
  numero?: string | null;
  dataEmissao?: string | null;
  dataValidade?: string | null;
  fatorAbrangencia?: number | null;
  anexoMime?: string | null;
  pontos?: Array<{ unidade?: string | null; incertezaExpandida?: number | null; fatorK?: number | null }>;
};

/** Valida um certificado de padrão antes de gravar (crit. 2). Retorna a lista de erros (vazia = ok). */
export function validarCertificadoPadrao(c: CertificadoPadraoValidavel): string[] {
  const erros: string[] = [];
  if (!c.numero?.trim()) erros.push("Número do certificado obrigatório");
  const em = c.dataEmissao ? new Date(c.dataEmissao) : null;
  const va = c.dataValidade ? new Date(c.dataValidade) : null;
  if (!em || !va) erros.push("Emissão e validade obrigatórias");
  else if (Number.isNaN(em.getTime()) || Number.isNaN(va.getTime())) erros.push("Data de emissão/validade inválida");
  else if (va.getTime() < em.getTime()) erros.push("Validade anterior à emissão");
  if (c.fatorAbrangencia != null && !(Number(c.fatorAbrangencia) > 0)) erros.push("Fator de abrangência k deve ser maior que zero");
  if (c.anexoMime && c.anexoMime !== "application/pdf") erros.push("Anexo do certificado deve ser PDF");
  (c.pontos ?? []).forEach((p, i) => {
    if (!p.unidade?.trim()) erros.push(`Ponto ${i + 1}: unidade obrigatória`);
    const u = p.incertezaExpandida;
    if (u == null || Number.isNaN(Number(u))) erros.push(`Ponto ${i + 1}: incerteza expandida (U) obrigatória`);
    else if (Number(u) < 0) erros.push(`Ponto ${i + 1}: incerteza expandida (U) não pode ser negativa`);
    if (p.fatorK != null && !(Number(p.fatorK) > 0)) erros.push(`Ponto ${i + 1}: k deve ser maior que zero`);
  });
  return erros;
}

export type PadraoParaAlerta = {
  id: string;
  nome: string;
  nSerie: string;
  tipoAnalisador?: string | null;
  /** certificado vigente (ou snapshot legado) */
  certificadoNumero?: string | null;
  certificadoValidade?: Date | string | null;
};

export type AlertaPadrao = {
  instrumentoId: string;
  nome: string;
  nSerie: string;
  tipoAnalisador: string | null;
  certificadoNumero: string | null;
  certificadoValidade: string | null;
  status: Extract<StatusCertificadoNaData, "A_VENCER" | "VENCIDO" | "SEM_CERTIFICADO">;
  /** dias até a validade (negativo = vencido há N dias); null sem certificado */
  dias: number | null;
};

/**
 * Lista de alertas de certificados de padrão (crit. 3): vencidos, a vencer na janela
 * e padrões sem certificado. Ordem: vencido → sem certificado → a vencer; depois por validade.
 */
export function montarAlertasPadroes(
  padroes: PadraoParaAlerta[],
  agora: Date = new Date(),
  diasAlerta: number = DIAS_ALERTA_PADRAO,
): AlertaPadrao[] {
  const janela = janelaAlerta(diasAlerta);
  const out: AlertaPadrao[] = [];
  for (const p of padroes) {
    const st = statusCertificadoNaData(p.certificadoValidade ?? null, agora, janela);
    if (st === "VALIDO") continue;
    const v = p.certificadoValidade ? new Date(p.certificadoValidade) : null;
    out.push({
      instrumentoId: p.id,
      nome: p.nome,
      nSerie: p.nSerie,
      tipoAnalisador: p.tipoAnalisador ?? null,
      certificadoNumero: p.certificadoNumero ?? null,
      certificadoValidade: v && !Number.isNaN(v.getTime()) ? v.toISOString() : null,
      status: st,
      dias: diasAteValidade(p.certificadoValidade ?? null, agora),
    });
  }
  const rank = { VENCIDO: 0, SEM_CERTIFICADO: 1, A_VENCER: 2 } as const;
  out.sort((a, b) => rank[a.status] - rank[b.status] || (a.dias ?? 0) - (b.dias ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"));
  return out;
}

export function resumoAlertasPadroes(alertas: AlertaPadrao[]) {
  return {
    vencidos: alertas.filter((a) => a.status === "VENCIDO").length,
    aVencer: alertas.filter((a) => a.status === "A_VENCER").length,
    semCertificado: alertas.filter((a) => a.status === "SEM_CERTIFICADO").length,
    total: alertas.length,
  };
}

export type CandidatoPadrao = {
  id: string;
  tipoAnalisador?: string | null;
  selecionavel: boolean;
};

export type SugestaoPadrao = {
  instrumentoId: string | null;
  origem: "PREFERENCIAL" | "MESMO_TIPO" | "NENHUM";
  aviso: string | null;
};

/**
 * Sugestão de padrão para o laudo pelo tipo de analisador (crit. 4).
 * Usa o preferencial se ele estiver selecionável (certificado válido/a vencer com pontos);
 * senão, o primeiro padrão selecionável do mesmo tipo, com aviso.
 */
export function sugerirPadrao(
  tipo: string | null | undefined,
  preferenciais: Array<{ tipo: string; instrumentoId: string }>,
  candidatos: CandidatoPadrao[],
): SugestaoPadrao {
  const t = (tipo ?? "").trim().toLowerCase();
  if (!t) return { instrumentoId: null, origem: "NENHUM", aviso: null };
  const pref = preferenciais.find((p) => p.tipo.trim().toLowerCase() === t);
  if (pref) {
    const c = candidatos.find((x) => x.id === pref.instrumentoId);
    if (c?.selecionavel) return { instrumentoId: c.id, origem: "PREFERENCIAL", aviso: null };
  }
  const mesmo = candidatos.find((x) => x.selecionavel && (x.tipoAnalisador ?? "").trim().toLowerCase() === t);
  if (mesmo) {
    return {
      instrumentoId: mesmo.id,
      origem: "MESMO_TIPO",
      aviso: pref
        ? "O padrão preferencial não está disponível (certificado vencido ou sem pontos); sugerido outro do mesmo tipo."
        : "Sem padrão preferencial para este tipo; sugerido um padrão do mesmo tipo.",
    };
  }
  return {
    instrumentoId: null,
    origem: "NENHUM",
    aviso: pref ? "O padrão preferencial não está disponível e não há outro válido do mesmo tipo." : null,
  };
}

/** Chave de comparação de tipo de analisador (sem acento, caixa ou pontuação). */
export function chaveTipo(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type CamposCadastroPadrao = {
  tipoAnalisador?: string | null;
  grandezas?: string[] | null;
  faixaMedicao?: string | null;
  resolucao?: string | null;
};

/** Campos obrigatórios do cadastro (decisão TL E1 #1). Retorna os rótulos que faltam. */
export function camposObrigatoriosFaltando(p: CamposCadastroPadrao): string[] {
  const falta: string[] = [];
  if (!p.tipoAnalisador?.trim()) falta.push("tipo de analisador");
  if (!(p.grandezas ?? []).some((g) => g?.trim())) falta.push("grandezas");
  if (!p.faixaMedicao?.trim()) falta.push("faixa de medição");
  if (!p.resolucao?.trim()) falta.push("resolução");
  return falta;
}

/** Preferencial só pode apontar para padrão do mesmo tipo de analisador (decisão TL E1 #2). */
export function preferencialCompativel(tipoPreferencial: string, tipoDoPadrao: string | null | undefined): boolean {
  const a = chaveTipo(tipoPreferencial);
  return !!a && a === chaveTipo(tipoDoPadrao);
}

export type ContextoSugestao = {
  /** tipo de analisador explícito */
  tipo?: string | null;
  /** tipo do laudo (CALIBRACAO, TSE...) */
  tipoLaudo?: string | null;
  /** nomes do equipamento (descrição, modelo, nome) para casar com o tipo do preferencial */
  nomesEquipamento?: Array<string | null | undefined>;
};

/**
 * Regra única de sugestão de padrão no laudo (decisão TL E1 #3; antes ficava no LaudoEditor).
 * Com `tipo` explícito usa `sugerirPadrao`. Sem tipo, casa o tipo dos preferenciais com os nomes do
 * equipamento; em TSE cai no preferencial de segurança elétrica; com um único preferencial válido, usa ele.
 */
export function sugerirPadraoLaudo(
  ctx: ContextoSugestao,
  preferenciais: Array<{ tipo: string; instrumentoId: string }>,
  candidatos: CandidatoPadrao[],
): SugestaoPadrao {
  if (ctx.tipo?.trim()) return sugerirPadrao(ctx.tipo, preferenciais, candidatos);
  const vivos = preferenciais.filter((p) => candidatos.some((c) => c.id === p.instrumentoId && c.selecionavel));
  if (!vivos.length) return { instrumentoId: null, origem: "NENHUM", aviso: null };
  const nomes = (ctx.nomesEquipamento ?? []).map(chaveTipo).filter(Boolean);
  for (const p of vivos) {
    const pk = chaveTipo(p.tipo);
    if (nomes.some((n) => n === pk || n.includes(pk) || pk.includes(n))) {
      return { instrumentoId: p.instrumentoId, origem: "PREFERENCIAL", aviso: null };
    }
  }
  if (ctx.tipoLaudo === "TSE") {
    const tse = vivos.find((p) => /tse|seguranca|eletr/.test(chaveTipo(p.tipo)));
    if (tse) return { instrumentoId: tse.instrumentoId, origem: "PREFERENCIAL", aviso: null };
  }
  if (vivos.length === 1) return { instrumentoId: vivos[0].instrumentoId, origem: "PREFERENCIAL", aviso: null };
  return { instrumentoId: null, origem: "NENHUM", aviso: null };
}
