/**
 * Regras puras do planejamento (preventiva, calibração, TSE, qualificação e outros).
 * Periodicidade nunca é inventada: sem valor cadastrado, não há próxima data automática.
 */

export type TipoAtividadePlano = "PREVENTIVA" | "CALIBRACAO" | "TSE" | "QUALIFICACAO" | "OUTRO";
export type TipoOsPlano = "CORRETIVA" | "PREVENTIVA" | "CALIBRACAO" | "TSE" | "QUALIFICACAO";
export type ResultadoPlano = "APROVADO" | "REPROVADO" | "APROVADO_COM_RESSALVAS" | "PENDENTE_ASSINATURA";
export type StatusAgendaPlano = "PREVISTA" | "A_VENCER" | "VENCIDA" | "OS_GERADA" | "EXECUTADA" | "CANCELADA";
export type ModoAgendamentoPlano = "CALENDARIO_FIXO" | "INTERVALO_EXECUCAO";

const MS_DIA = 24 * 60 * 60 * 1000;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function isoDate(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}

export function addMonths(base: Date, months: number): Date {
  const d = startOfDay(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function chaveUnicaPlano(tipo: TipoAtividadePlano, tipoCustomId?: string | null): string {
  if (tipo === "OUTRO") return `OUTRO:${tipoCustomId ?? ""}`;
  return tipo;
}

export function tipoOsDaAtividade(tipo: TipoAtividadePlano | string): TipoOsPlano {
  switch (tipo) {
    case "PREVENTIVA":
      return "PREVENTIVA";
    case "CALIBRACAO":
      return "CALIBRACAO";
    case "TSE":
      return "TSE";
    case "QUALIFICACAO":
      return "QUALIFICACAO";
    default:
      return "PREVENTIVA";
  }
}

/** Corretiva nunca cumpre preventiva/calibração/TSE/qualificação. */
export function tipoOsCumprePlano(tipoOs: string): boolean {
  return (
    tipoOs === "PREVENTIVA" ||
    tipoOs === "CALIBRACAO" ||
    tipoOs === "TSE" ||
    tipoOs === "QUALIFICACAO"
  );
}

export function resultadoFechaCiclo(resultado?: ResultadoPlano | string | null): boolean {
  return resultado === "APROVADO" || resultado === "APROVADO_COM_RESSALVAS";
}

/** Executado ≠ aprovado: reprovado/pendente não libera a próxima data. */
export function resultadoLiberaProximaData(resultado?: ResultadoPlano | string | null): boolean {
  return resultadoFechaCiclo(resultado);
}

export function calcularAtrasoDias(
  dataOriginal: Date,
  agora: Date,
  executadaEm?: Date | null,
): number {
  const ref = startOfDay(executadaEm ?? agora);
  const orig = startOfDay(dataOriginal);
  return Math.max(0, Math.floor((ref.getTime() - orig.getTime()) / MS_DIA));
}

/**
 * Reprogramar muda a data prevista, nunca apaga a original nem o atraso já caracterizado.
 */
export function aplicarReprogramacao(opts: {
  dataPrevistaOriginal: Date;
  novaData: Date;
  motivo: string;
  agora: Date;
}): { dataPrevista: Date; dataPrevistaOriginal: Date; atrasoDias: number; motivo: string } {
  const motivo = opts.motivo.trim();
  if (!motivo) {
    throw new Error("Informe o motivo da reprogramação");
  }
  const nova = startOfDay(opts.novaData);
  const original = startOfDay(opts.dataPrevistaOriginal);
  return {
    dataPrevista: nova,
    dataPrevistaOriginal: original,
    atrasoDias: calcularAtrasoDias(original, opts.agora),
    motivo,
  };
}

export function proximaDataIntervalo(execucao: Date, periodicidadeMeses?: number | null): Date | null {
  if (!periodicidadeMeses || periodicidadeMeses < 1) return null;
  return addMonths(execucao, periodicidadeMeses);
}

export function proximaDataCalendarioFixo(
  aPartirDe: Date,
  diaFixo: number,
  mesFixo?: number | null,
): Date {
  const from = startOfDay(aPartirDe);
  const dia = Math.min(31, Math.max(1, Math.floor(diaFixo)));
  if (mesFixo && mesFixo >= 1 && mesFixo <= 12) {
    const mes = mesFixo - 1;
    const y = from.getFullYear();
    let cand = new Date(y, mes, Math.min(dia, daysInMonth(y, mes)));
    cand = startOfDay(cand);
    if (cand <= from) {
      cand = new Date(y + 1, mes, Math.min(dia, daysInMonth(y + 1, mes)));
      cand = startOfDay(cand);
    }
    return cand;
  }
  let year = from.getFullYear();
  let month = from.getMonth();
  let cand = startOfDay(new Date(year, month, Math.min(dia, daysInMonth(year, month))));
  if (cand <= from) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    cand = startOfDay(new Date(year, month, Math.min(dia, daysInMonth(year, month))));
  }
  return cand;
}

export function calcularProximaData(opts: {
  modo: ModoAgendamentoPlano;
  periodicidadeMeses?: number | null;
  diaFixo?: number | null;
  mesFixo?: number | null;
  dataExecucao: Date;
}): Date | null {
  if (opts.modo === "CALENDARIO_FIXO") {
    if (!opts.diaFixo) return null;
    return proximaDataCalendarioFixo(opts.dataExecucao, opts.diaFixo, opts.mesFixo);
  }
  return proximaDataIntervalo(opts.dataExecucao, opts.periodicidadeMeses);
}

export function classificarAgenda(
  dataPrevista: Date,
  antecedenciaDias: number,
  agora: Date,
  opts: { osId?: string | null; executada?: boolean; cumpriu?: boolean; cancelada?: boolean } = {},
): StatusAgendaPlano {
  if (opts.cancelada) return "CANCELADA";
  if (opts.executada && opts.cumpriu) return "EXECUTADA";
  const due = startOfDay(dataPrevista);
  const today = startOfDay(agora);
  if (due.getTime() < today.getTime()) return "VENCIDA";
  if (opts.osId) return "OS_GERADA";
  const lead = Math.max(0, antecedenciaDias || 0);
  const aVencerDesde = new Date(due);
  aVencerDesde.setDate(aVencerDesde.getDate() - lead);
  if (today.getTime() >= aVencerDesde.getTime()) return "A_VENCER";
  return "PREVISTA";
}

export function devePularGeracaoOs(opts: {
  osId?: string | null;
  existeOsAbertaMesmoTipo: boolean;
  planoAtivo: boolean;
}): { pular: boolean; motivo?: string } {
  if (!opts.planoAtivo) return { pular: true, motivo: "Plano suspenso ou desativado" };
  if (opts.osId) return { pular: true, motivo: "Já existe OS desta ocorrência" };
  if (opts.existeOsAbertaMesmoTipo) {
    return { pular: true, motivo: "Já existe OS aberta deste tipo neste equipamento" };
  }
  return { pular: false };
}

export function grupoEstaCumprido(atividades: Array<{ cumpriu: boolean }>): boolean {
  return atividades.length > 0 && atividades.every((a) => a.cumpriu);
}

export function chaveOcorrencia(planoInstanciaId: string, dataOriginal: Date): string {
  return `${planoInstanciaId}|${isoDate(dataOriginal)}`;
}

/** Antecedência: gera OS quando falta N dias (ou já venceu). Sem data prevista, não gera. */
export function noPrazoDeGeracao(
  dataPrevista: Date | null | undefined,
  antecedenciaDias: number,
  agora: Date,
): boolean {
  if (!dataPrevista) return false;
  const due = startOfDay(dataPrevista);
  const limite = startOfDay(agora);
  limite.setDate(limite.getDate() + Math.max(0, antecedenciaDias || 0));
  return due.getTime() <= limite.getTime();
}
