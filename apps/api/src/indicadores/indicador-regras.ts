/**
 * Fórmulas do painel do gestor. Números só saem de registros;
 * denominador 0 → nulo (nunca 100%); estimado nunca se apresenta como medido.
 */

export const MS_HORA = 36e5;
export const MS_DIA = 24 * MS_HORA;
export const OS_ANTIGA_DIAS = 7;

export const DADOS_INSUFICIENTES = "dados insuficientes";

export type Intervalo = { inicio: number; fim: number };

export type MetricaNumerica = {
  valor: number | null;
  n: number;
  status: "medido" | "dados_insuficientes";
  motivo?: string;
  formula: string;
  origem: string;
};

export type Razao = {
  numerador: number;
  denominador: number;
  percentual: number | null;
  status: "medido" | "dados_insuficientes";
  motivo?: string;
  formula: string;
};

export type LogTempoOs = {
  acao: string;
  em: Date | string;
};

export type TemposOs = {
  duracaoTotalMs: number | null;
  atePrimeiroAtendimentoMs: number | null;
  tempoTrabalhadoMs: number | null;
  pausasEAguardosMs: number | null;
  indisponibilidadeMs: number | null;
  temInicioExecucao: boolean;
  temCadeiaTrabalho: boolean;
};

export type OcorrenciaIndicador = {
  id: string;
  status: string;
  dataPrevista: Date | string;
  dataPrevistaOriginal: Date | string;
  atrasoDias: number;
  executadaEm?: Date | string | null;
  cumpriuPlano: boolean;
  reprogramadaEm?: Date | string | null;
  planoStatus?: string | null;
};

export type ClasseProgramada =
  | "prevista"
  | "pendente_no_prazo"
  | "pendente_atrasada"
  | "executada_no_prazo"
  | "executada_atrasada"
  | "cancelada"
  | "plano_suspenso";

const ACOES_INICIO_TRABALHO = new Set(["INICIO_EXECUCAO", "RETOMADA"]);
const ACOES_FIM_TRABALHO = new Set(["PAUSA", "AGUARDO", "FECHAMENTO", "CANCELAMENTO"]);

export function toMs(d: Date | string | number): number {
  return d instanceof Date ? d.getTime() : new Date(d).getTime();
}

export function horasDe(ms: number | null): number | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return Number((ms / MS_HORA).toFixed(2));
}

export function media(valores: number[]): number | null {
  if (!valores.length) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

/** Denominador 0 → nulo. Ausência de dados nunca vira 100%. */
export function razaoPercentual(
  numerador: number,
  denominador: number,
  formula: string,
  motivoVazio = "Sem registros no denominador — ausência de dados não é 100%.",
): Razao {
  if (denominador <= 0) {
    return {
      numerador,
      denominador: 0,
      percentual: null,
      status: "dados_insuficientes",
      motivo: motivoVazio,
      formula,
    };
  }
  return {
    numerador,
    denominador,
    percentual: Number(((numerador / denominador) * 100).toFixed(1)),
    status: "medido",
    formula,
  };
}

export function metricaMedia(
  valores: number[],
  formula: string,
  origem: string,
  minimo = 1,
  motivoVazio = DADOS_INSUFICIENTES,
): MetricaNumerica {
  if (valores.length < minimo) {
    return {
      valor: null,
      n: valores.length,
      status: "dados_insuficientes",
      motivo: motivoVazio,
      formula,
      origem,
    };
  }
  const m = media(valores);
  return {
    valor: m == null ? null : Number(m.toFixed(2)),
    n: valores.length,
    status: "medido",
    formula,
    origem,
  };
}

/**
 * Une intervalos sobrepostos (mesmo equipamento / mesmo recorte)
 * para não duplicar horas de parada ou trabalho.
 */
export function unirIntervalos(intervalos: Intervalo[]): Intervalo[] {
  const validos = intervalos
    .map((i) => ({ inicio: Math.min(i.inicio, i.fim), fim: Math.max(i.inicio, i.fim) }))
    .filter((i) => i.fim > i.inicio)
    .sort((a, b) => a.inicio - b.inicio);
  const out: Intervalo[] = [];
  for (const cur of validos) {
    const last = out[out.length - 1];
    if (!last || cur.inicio > last.fim) {
      out.push({ ...cur });
    } else {
      last.fim = Math.max(last.fim, cur.fim);
    }
  }
  return out;
}

export function somaIntervalosMs(intervalos: Intervalo[]): number {
  return unirIntervalos(intervalos).reduce((s, i) => s + (i.fim - i.inicio), 0);
}

export function recortarIntervalo(i: Intervalo, deMs: number, ateMs: number): Intervalo | null {
  const inicio = Math.max(i.inicio, deMs);
  const fim = Math.min(i.fim, ateMs);
  if (fim <= inicio) return null;
  return { inicio, fim };
}

export function motivoAguardaFornecedor(motivo?: string | null, oficina?: string | null): boolean {
  const t = `${motivo ?? ""} ${oficina ?? ""}`.toLowerCase();
  return /fornecedor|externo|assist[eê]ncia|oficina|terceir|contrato|conserto fora/.test(t);
}

export function temposDaOs(opts: {
  abertura: Date | string;
  fechamento?: Date | string | null;
  status: string;
  agora?: Date | string;
  logs: LogTempoOs[];
  equipamentoParado?: boolean;
  condicaoFinal?: string | null;
}): TemposOs {
  const abertura = toMs(opts.abertura);
  const agora = toMs(opts.agora ?? Date.now());
  const encerrada = Boolean(opts.fechamento) || opts.status === "CONCLUIDA" || opts.status === "CANCELADA";
  const fimOs = opts.fechamento ? toMs(opts.fechamento) : agora;
  const duracaoTotalMs = fimOs >= abertura ? fimOs - abertura : null;

  const logs = [...opts.logs].sort((a, b) => toMs(a.em) - toMs(b.em));
  const inicio = logs.find((l) => l.acao === "INICIO_EXECUCAO");
  const atePrimeiroAtendimentoMs = inicio ? Math.max(0, toMs(inicio.em) - abertura) : null;

  let trabalhoMs = 0;
  let pausaMs = 0;
  let abertoEm: number | null = null;
  let pausaEm: number | null = null;
  let cadeia = false;

  for (const log of logs) {
    const t = toMs(log.em);
    if (ACOES_INICIO_TRABALHO.has(log.acao)) {
      cadeia = true;
      if (pausaEm != null) {
        pausaMs += Math.max(0, t - pausaEm);
        pausaEm = null;
      }
      if (abertoEm == null) abertoEm = t;
    } else if (ACOES_FIM_TRABALHO.has(log.acao)) {
      if (abertoEm != null) {
        cadeia = true;
        trabalhoMs += Math.max(0, t - abertoEm);
        abertoEm = null;
      }
      if (log.acao === "PAUSA" || log.acao === "AGUARDO") pausaEm = t;
    }
  }
  if (abertoEm != null && !encerrada) {
    cadeia = true;
    trabalhoMs += Math.max(0, agora - abertoEm);
  }
  if (pausaEm != null && !encerrada) {
    pausaMs += Math.max(0, agora - pausaEm);
  }

  const parado = Boolean(opts.equipamentoParado) || opts.condicaoFinal === "PARADO";
  const indisponibilidadeMs = parado && duracaoTotalMs != null ? duracaoTotalMs : null;

  return {
    duracaoTotalMs,
    atePrimeiroAtendimentoMs,
    tempoTrabalhadoMs: cadeia ? trabalhoMs : null,
    pausasEAguardosMs: cadeia ? pausaMs : null,
    indisponibilidadeMs,
    temInicioExecucao: Boolean(inicio),
    temCadeiaTrabalho: cadeia,
  };
}

/**
 * Atraso da programada usa a data ORIGINAL. Reagendar não zera o indicador.
 */
export function atrasoProgramadaDias(
  dataPrevistaOriginal: Date | string,
  agora: Date | string,
  executadaEm?: Date | string | null,
): number {
  const ref = startOfDayMs(executadaEm ?? agora);
  const orig = startOfDayMs(dataPrevistaOriginal);
  return Math.max(0, Math.floor((ref - orig) / MS_DIA));
}

function startOfDayMs(d: Date | string | number): number {
  const x = new Date(typeof d === "number" ? d : d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function classificarProgramada(
  oc: OcorrenciaIndicador,
  agora: Date | string = new Date(),
): ClasseProgramada {
  const plano = (oc.planoStatus ?? "ATIVO").toUpperCase();
  if (plano === "SUSPENSO" || plano === "DESATIVADO") return "plano_suspenso";
  if (oc.status === "CANCELADA") return "cancelada";
  const atraso = Math.max(oc.atrasoDias, atrasoProgramadaDias(oc.dataPrevistaOriginal, agora, oc.executadaEm));
  const executada = Boolean(oc.executadaEm) || oc.status === "EXECUTADA" || oc.cumpriuPlano;
  if (executada) return atraso > 0 ? "executada_atrasada" : "executada_no_prazo";
  if (atraso > 0) return "pendente_atrasada";
  const orig = startOfDayMs(oc.dataPrevistaOriginal);
  const today = startOfDayMs(agora);
  if (orig > today) return "prevista";
  return "pendente_no_prazo";
}

export function cumprimentoProgramadas(
  ocorrencias: OcorrenciaIndicador[],
  de: Date | string,
  ate: Date | string,
  agora: Date | string = new Date(),
): {
  razao: Razao;
  contagens: Record<ClasseProgramada, number>;
  devidas: number;
  excluidas: { canceladas: number; suspensas: number };
} {
  const deMs = startOfDayMs(de);
  const ateMs = startOfDayMs(ate) + MS_DIA - 1;
  const contagens: Record<ClasseProgramada, number> = {
    prevista: 0,
    pendente_no_prazo: 0,
    pendente_atrasada: 0,
    executada_no_prazo: 0,
    executada_atrasada: 0,
    cancelada: 0,
    plano_suspenso: 0,
  };
  let noPrazo = 0;
  let devidas = 0;
  let canceladas = 0;
  let suspensas = 0;

  for (const oc of ocorrencias) {
    const orig = startOfDayMs(oc.dataPrevistaOriginal);
    const classe = classificarProgramada(oc, agora);
    if (orig < deMs || orig > ateMs) continue;
    contagens[classe] += 1;
    if (classe === "cancelada") {
      canceladas += 1;
      continue;
    }
    if (classe === "plano_suspenso") {
      suspensas += 1;
      continue;
    }
    if (classe === "prevista") continue;
    devidas += 1;
    if (classe === "executada_no_prazo") noPrazo += 1;
  }

  return {
    razao: razaoPercentual(
      noPrazo,
      devidas,
      "executadas na data original / (devidas no período, excluídas canceladas e suspensas)",
      "Nenhuma ocorrência devida no período. Cumprimento não é 100%.",
    ),
    contagens,
    devidas,
    excluidas: { canceladas, suspensas },
  };
}

export function mttrDeParadas(paradasConcluidasMs: number[]): MetricaNumerica {
  return metricaMedia(
    paradasConcluidasMs.map((ms) => ms / MS_HORA),
    "média das durações (fim − início) de paradas registradas já encerradas, intervalos fundidos por equipamento",
    "OS corretiva com equipamentoParado=true e fechamento, ou condição final PARADO→APTO",
    1,
    "Não há parada registrada com início e fim. Duração da OS não é usada como MTTR.",
  );
}

export function mtbfDeFalhas(opts: {
  periodoMs: number;
  downtimeMs: number;
  falhas: number;
}): MetricaNumerica {
  const uptime = opts.periodoMs - opts.downtimeMs;
  if (opts.falhas < 2 || opts.periodoMs <= 0 || uptime <= 0) {
    return {
      valor: null,
      n: opts.falhas,
      status: "dados_insuficientes",
      motivo:
        "MTBF exige ≥ 2 falhas com tempo de operação conhecido (período − paradas fundidas). Intervalo entre aberturas de OS não é MTBF.",
      formula: "(horas de operação no período) / (nº de falhas com parada registrada)",
      origem: "paradas registradas no período",
    };
  }
  return {
    valor: Number((uptime / MS_HORA / opts.falhas).toFixed(2)),
    n: opts.falhas,
    status: "medido",
    formula: "(horas de operação no período) / (nº de falhas com parada registrada)",
    origem: "paradas registradas no período",
  };
}

export function disponibilidadeDeParadas(opts: {
  parqueHorasMs: number;
  downtimeMs: number;
  equipamentosComSinal: number;
  equipamentosParque: number;
}): MetricaNumerica {
  if (opts.parqueHorasMs <= 0 || opts.equipamentosParque <= 0) {
    return {
      valor: null,
      n: 0,
      status: "dados_insuficientes",
      motivo: "Sem parque no período.",
      formula: "(horas parque − horas paradas fundidas) / horas parque",
      origem: "paradas registradas",
    };
  }
  if (opts.equipamentosComSinal <= 0) {
    return {
      valor: null,
      n: 0,
      status: "dados_insuficientes",
      motivo:
        "Nenhuma parada foi registrada. Ausência de dado não é 100% de disponibilidade (o campo equipamentoParado defaulta falso).",
      formula: "(horas parque − horas paradas fundidas) / horas parque",
      origem: "paradas registradas",
    };
  }
  const pct = Number((((opts.parqueHorasMs - opts.downtimeMs) / opts.parqueHorasMs) * 100).toFixed(1));
  return {
    valor: pct,
    n: opts.equipamentosComSinal,
    status: "medido",
    formula: "(horas parque − horas paradas fundidas, sem duplicar sobreposição) / horas parque",
    origem: "somente paradas registradas — não cobre omissões",
  };
}

export function snapshotParqueEmOperacao(ativos: number, totalNaoArquivado: number): Razao {
  return razaoPercentual(
    ativos,
    totalNaoArquivado,
    "equipamentos ATIVO/EM_GARANTIA / (parque não arquivado)",
    "Parque vazio — não é disponibilidade medida.",
  );
}

export type CustoLinha = {
  valor: number;
  natureza: "realizado" | "estimado" | "aprovado";
};

export function somarCustos(linhas: CustoLinha[]) {
  const realizado = linhas.filter((l) => l.natureza === "realizado").reduce((s, l) => s + l.valor, 0);
  const estimado = linhas.filter((l) => l.natureza === "estimado").reduce((s, l) => s + l.valor, 0);
  const aprovado = linhas.filter((l) => l.natureza === "aprovado").reduce((s, l) => s + l.valor, 0);
  return {
    realizado: Number(realizado.toFixed(2)),
    estimado: Number(estimado.toFixed(2)),
    aprovado: Number(aprovado.toFixed(2)),
  };
}

export type CargaTecnico = {
  id: string;
  nome: string;
  abertas: number;
  emAndamento: number;
  aguardando: number;
  concluidasPeriodo: number;
  tempoTrabalhadoHoras: number | null;
  tempoAbertoHorasMedia: number | null;
};

export function resumoCarga(c: CargaTecnico) {
  return {
    ...c,
    nota: "Quantidade de OS concluídas não mede produtividade. Use também tempo trabalhado, fila e aguardos.",
  };
}

export const FORMULAS_PAINEL: Array<{ chave: string; nome: string; formula: string; nota: string }> = [
  {
    chave: "duracao_os",
    nome: "Duração total da OS",
    formula: "fechamento (ou agora) − abertura, relógio corrido",
    nota: "Não é MTTR nem indisponibilidade. Inclui noites, fins de semana e aguardos.",
  },
  {
    chave: "primeiro_atendimento",
    nome: "Tempo até o 1º atendimento",
    formula: "primeiro log INICIO_EXECUCAO − abertura",
    nota: "Sem o log, o indicador fica em dados insuficientes. Não se usa a duração da OS no lugar.",
  },
  {
    chave: "tempo_trabalhado",
    nome: "Tempo trabalhado",
    formula: "soma dos intervalos INICIO_EXECUCAO/RETOMADA → PAUSA/AGUARDO/FECHAMENTO",
    nota: "Pausas e aguardos saem desta soma. Sem cadeia de logs, dados insuficientes.",
  },
  {
    chave: "indisponibilidade",
    nome: "Indisponibilidade registrada",
    formula: "intervalos com equipamento parado, fundidos por equipamento",
    nota: "Só conta parada marcada (equipamentoParado ou condição PARADO). Default falso ≠ disponível.",
  },
  {
    chave: "mttr",
    nome: "MTTR",
    formula: "média das paradas registradas já encerradas",
    nota: "Só é emitido com início e fim de parada. Duração de OS não entra.",
  },
  {
    chave: "mtbf",
    nome: "MTBF",
    formula: "horas de operação no período / falhas com parada registrada (≥ 2)",
    nota: "Intervalo entre aberturas de corretiva não é MTBF.",
  },
  {
    chave: "disponibilidade",
    nome: "Disponibilidade",
    formula: "(horas parque − paradas fundidas) / horas parque",
    nota: "Exige paradas registradas. Snapshot ATIVO/total é outro número (parque em operação).",
  },
  {
    chave: "cumprimento",
    nome: "Cumprimento de programadas",
    formula: "executadas na data original / devidas no período",
    nota: "Reagendar não apaga atraso (dataPrevistaOriginal). Canceladas e suspensas ficam de fora do denominador.",
  },
  {
    chave: "sla",
    nome: "Meta de SLA",
    formula: "prazo do tipo de equipamento; senão, prazo por prioridade",
    nota: "Relógio corrido a partir da abertura. Não há calendário de expediente nem desconto automático de pausa no SLA.",
  },
];

export const LIMITACOES_HEF = [
  "O histórico operacional da HEF foi reimportado recentemente: OS antigas não sustentam MTBF nem disponibilidade de longo prazo.",
  "OS novas só entram nos indicadores depois de existirem no banco desta instituição.",
  "Tempo até 1º atendimento e tempo trabalhado dependem dos logs INICIO_EXECUCAO / PAUSA / AGUARDO / RETOMADA.",
  "SLA e durações usam relógio corrido (24 h). Pausas não descontam o limite de SLA.",
  "Ausência de registro (parque parado não marcado, denominador vazio) nunca é apresentada como 100%.",
  "Custo realizado vem de itens da OS (material e mão de obra). CAPEX estimado/aprovado aparece separado. Rateio de contrato não entra como realizado da OS.",
];
