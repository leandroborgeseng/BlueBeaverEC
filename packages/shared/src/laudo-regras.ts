/**
 * Checklist versionado, medições sem tolerância inventada, relatório ≠ certificado.
 */

export const TIPOS_CAMPO_CHECKLIST = [
  "texto",
  "numero",
  "unidade",
  "selecao",
  "aprovado_reprovado",
  "na",
  "check",
  "medicao",
  "calibracao",
] as const;

export type TipoCampoChecklist = (typeof TIPOS_CAMPO_CHECKLIST)[number];
export type ResultadoAvaliacao = "APROVADO" | "REPROVADO" | "NAO_AVALIADO";
export type ResultadoLaudoCalc =
  | "APROVADO"
  | "REPROVADO"
  | "APROVADO_COM_RESSALVAS"
  | "PENDENTE_ASSINATURA"
  | "NAO_AVALIADO";
export type StatusCertificadoNaData = "VALIDO" | "A_VENCER" | "VENCIDO" | "SEM_CERTIFICADO";
export type StatusDocumentoLaudo = "RASCUNHO" | "FINAL";

export type ToleranciaCriterio = {
  valor?: number | null;
  modo?: "absoluto" | "percentual" | string | null;
  unidade?: string | null;
  texto?: string | null;
  referencia?: string | null;
  versao?: string | null;
};

export type ItemChecklistModelo = {
  id?: string;
  pergunta?: string;
  secao?: string;
  tipo?: string;
  obrigatorio?: boolean;
  permiteNA?: boolean;
  opcoes?: string[];
  unidade?: string;
  grandeza?: string;
  valorPadrao?: number;
  limite?: number | null;
  repeticoes?: number;
  tolerancia?: ToleranciaCriterio | null;
};

export type RespostaChecklist = {
  id?: string;
  pergunta?: string;
  secao?: string;
  tipo?: string;
  obrigatorio?: boolean;
  status?: string;
  valor?: string | number | boolean | null;
  valorTexto?: string;
  valorMedido?: number | null;
  valorConfigurado?: number | null;
  valorReferencia?: number | null;
  grandeza?: string;
  unidade?: string;
  leituras?: Array<number | null | undefined>;
  media?: number | null;
  mediaCorrigida?: number | null;
  erroAbs?: number | null;
  erroPct?: number | null;
  limite?: number | null;
  toleranciaTexto?: string;
  criterioReferencia?: string | null;
  criterioVersao?: string | null;
  observacao?: string;
  correcaoPadrao?: number | null;
  incertezaExpandida?: number | null;
  fatorK?: number | null;
  pontoCertificadoRef?: string;
  origemMedicao?: "MANUAL" | "ANALISADOR";
  avaliacao?: ResultadoAvaliacao;
};

export type PontoPadraoCert = {
  id?: string;
  valorNominal?: number | null;
  valorConvencional?: number | null;
  correcao?: number | null;
  incertezaExpandida?: number | null;
  fatorK?: number | null;
  unidade?: string | null;
  grandeza?: string | null;
};

export type CertificadoPadraoRef = {
  id?: string;
  numero?: string | null;
  dataEmissao?: string | Date | null;
  dataValidade?: string | Date | null;
  laboratorioEmissor?: string | null;
  vigente?: boolean;
  pontos?: PontoPadraoCert[];
};

const LABEL_TIPO: Record<string, string> = {
  RECEBIMENTO: "Recebimento",
  PREVENTIVA: "Preventiva",
  CALIBRACAO: "Calibração",
  TSE: "Teste de segurança elétrica",
  QUALIFICACAO: "Qualificação",
};

export function labelTipoIntervencao(tipo: string): string {
  return LABEL_TIPO[tipo] ?? tipo;
}

export function tituloDocumentoTecnico(tipo: string) {
  return {
    titulo: "Relatório de serviço",
    subtipo: labelTipoIntervencao(tipo),
    filenamePrefix: "relatorio-servico",
  };
}

export function mediaLeituras(leituras: Array<number | null | undefined> | undefined): number | null {
  const nums = (leituras ?? [])
    .map((v) => (v == null || Number.isNaN(Number(v)) ? undefined : Number(v)))
    .filter((v): v is number => v != null);
  if (!nums.length) return null;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4));
}

export function pontoPadraoMaisProximo(referencia: number, pontos: PontoPadraoCert[] | undefined): PontoPadraoCert | null {
  if (!pontos?.length) return null;
  let best: PontoPadraoCert | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const p of pontos) {
    const ref = p.valorNominal ?? p.valorConvencional;
    if (ref == null || Number.isNaN(Number(ref))) continue;
    const d = Math.abs(Number(ref) - referencia);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

export function criterioNumericoDe(item: {
  tolerancia?: ToleranciaCriterio | null;
  limite?: number | null;
}) {
  const tol = item.tolerancia;
  const valor = tol?.valor ?? item.limite;
  const tem = valor != null && !Number.isNaN(Number(valor));
  return {
    temCriterio: tem,
    valor: tem ? Number(valor) : undefined,
    modo: tol?.modo ?? undefined,
    referencia: tol?.referencia ?? null,
    versao: tol?.versao ?? null,
    texto: tol?.texto ?? null,
  };
}

export function avaliarMedicao(args: {
  valorMedido: number | null | undefined;
  valorReferencia?: number | null;
  correcao?: number | null;
  item: { tolerancia?: ToleranciaCriterio | null; limite?: number | null };
}): {
  mediaCorrigida: number | null;
  erroAbs: number | null;
  erroPct: number | null;
  status: ResultadoAvaliacao;
  motivo: string;
} {
  if (args.valorMedido == null || Number.isNaN(Number(args.valorMedido))) {
    return { mediaCorrigida: null, erroAbs: null, erroPct: null, status: "NAO_AVALIADO", motivo: "Sem valor medido" };
  }
  const correcao = args.correcao != null && !Number.isNaN(Number(args.correcao)) ? Number(args.correcao) : 0;
  const mediaCorrigida = Number((Number(args.valorMedido) + correcao).toFixed(4));
  const ref = args.valorReferencia;
  const erroAbs =
    ref != null && !Number.isNaN(Number(ref)) ? Number((mediaCorrigida - Number(ref)).toFixed(4)) : null;
  const erroPct =
    erroAbs != null && ref != null && Number(ref) !== 0
      ? Number(((erroAbs / Number(ref)) * 100).toFixed(2))
      : erroAbs != null && ref === 0
        ? 0
        : null;
  const criterio = criterioNumericoDe(args.item);
  if (!criterio.temCriterio || criterio.valor == null) {
    return {
      mediaCorrigida,
      erroAbs,
      erroPct,
      status: "NAO_AVALIADO",
      motivo: "Sem critério de aceitação publicado (referência e versão). Não se declara conformidade.",
    };
  }
  if (criterio.modo === "absoluto") {
    if (erroAbs == null) {
      return { mediaCorrigida, erroAbs, erroPct, status: "NAO_AVALIADO", motivo: "Critério absoluto exige valor de referência" };
    }
    const ok = Math.abs(erroAbs) <= criterio.valor;
    return {
      mediaCorrigida,
      erroAbs,
      erroPct,
      status: ok ? "APROVADO" : "REPROVADO",
      motivo: ok ? "Erro absoluto dentro do critério" : "Erro absoluto acima do critério",
    };
  }
  if (erroPct == null) {
    return { mediaCorrigida, erroAbs, erroPct, status: "NAO_AVALIADO", motivo: "Critério percentual exige valor de referência" };
  }
  const ok = Math.abs(erroPct) <= criterio.valor;
  return {
    mediaCorrigida,
    erroAbs,
    erroPct,
    status: ok ? "APROVADO" : "REPROVADO",
    motivo: ok ? "Erro percentual dentro do critério" : "Erro percentual acima do critério",
  };
}

export function avaliarPontoCalibracao(args: {
  itemModelo?: ItemChecklistModelo;
  resposta: RespostaChecklist;
  pontosCertificado?: PontoPadraoCert[];
}): RespostaChecklist {
  const r = args.resposta;
  const item = args.itemModelo;
  const padrao = item?.valorPadrao ?? r.valorConfigurado ?? r.valorReferencia ?? null;
  const media = mediaLeituras(r.leituras) ?? (r.valorMedido != null ? Number(r.valorMedido) : null);
  const ponto = padrao != null ? pontoPadraoMaisProximo(padrao, args.pontosCertificado) : null;
  const correcao = ponto?.correcao != null ? Number(ponto.correcao) : 0;
  const avaliado = avaliarMedicao({
    valorMedido: media,
    valorReferencia: padrao,
    correcao,
    item: { tolerancia: item?.tolerancia ?? null, limite: item?.limite ?? null },
  });
  return {
    ...r,
    origemMedicao: r.origemMedicao ?? "MANUAL",
    valorConfigurado: padrao ?? r.valorConfigurado,
    valorReferencia: padrao ?? r.valorReferencia,
    valorMedido: media,
    media,
    mediaCorrigida: avaliado.mediaCorrigida,
    correcaoPadrao: correcao || undefined,
    incertezaExpandida: ponto?.incertezaExpandida != null ? Number(ponto.incertezaExpandida) : r.incertezaExpandida,
    fatorK: ponto?.fatorK != null ? Number(ponto.fatorK) : r.fatorK,
    pontoCertificadoRef:
      ponto?.valorNominal != null
        ? `nominal=${ponto.valorNominal}`
        : ponto?.valorConvencional != null
          ? `conv=${ponto.valorConvencional}`
          : r.pontoCertificadoRef,
    erroAbs: avaliado.erroAbs,
    erroPct: avaliado.erroPct,
    limite: item?.limite ?? item?.tolerancia?.valor ?? null,
    toleranciaTexto: item?.tolerancia?.texto ?? r.toleranciaTexto,
    criterioReferencia: item?.tolerancia?.referencia ?? r.criterioReferencia,
    criterioVersao: item?.tolerancia?.versao ?? r.criterioVersao,
    grandeza: item?.grandeza ?? r.grandeza,
    unidade: item?.unidade ?? r.unidade,
    avaliacao: avaliado.status,
    status: avaliado.status,
  };
}

function ehMedicao(r: RespostaChecklist, tipoLaudo: string): boolean {
  if (["check", "texto", "selecao", "aprovado_reprovado", "na"].includes(r.tipo ?? "")) return false;
  if (r.tipo === "calibracao" || r.tipo === "medicao") return true;
  if (tipoLaudo === "CALIBRACAO" && (r.valorConfigurado != null || (r.leituras?.length ?? 0) > 0)) return true;
  if ((tipoLaudo === "TSE" || tipoLaudo === "CALIBRACAO") && r.valorMedido != null) return true;
  return false;
}

export function itensObrigatoriosPendentes(respostas: RespostaChecklist[], modelo?: ItemChecklistModelo[]): string[] {
  const pendentes: string[] = [];
  for (const [i, r] of respostas.entries()) {
    const m = modelo?.find((x) => x.id && x.id === r.id) ?? modelo?.[i];
    const obrigatorio = r.obrigatorio ?? m?.obrigatorio;
    if (!obrigatorio) continue;
    const tipo = r.tipo ?? m?.tipo;
    const label = r.pergunta ?? m?.pergunta ?? `Item ${i + 1}`;
    if (tipo === "texto" && !String(r.valorTexto ?? r.valor ?? "").trim() && !r.observacao?.trim()) pendentes.push(label);
    else if (["numero", "medicao", "calibracao"].includes(tipo ?? "") && r.valorMedido == null && mediaLeituras(r.leituras) == null && r.status !== "NA")
      pendentes.push(label);
    else if (!r.status) pendentes.push(label);
  }
  return pendentes;
}

export function calcularResultadoLaudo(tipo: string, respostas: RespostaChecklist[]): ResultadoLaudoCalc {
  if (tipo === "CALIBRACAO" || tipo === "TSE") {
    const medicao = respostas.filter((r) => ehMedicao(r, tipo));
    const checks = respostas.filter((r) => r.tipo === "check" || r.tipo === "aprovado_reprovado");
    if (checks.some((r) => r.status === "NAO" || r.status === "REPROVADO")) return "REPROVADO";
    if (medicao.some((r) => r.status === "REPROVADO" || r.avaliacao === "REPROVADO")) return "REPROVADO";
    const preenchidosNaoAvaliados = medicao.filter((r) => {
      const temValor = r.valorMedido != null || mediaLeituras(r.leituras) != null;
      return temValor && (r.status === "NAO_AVALIADO" || r.avaliacao === "NAO_AVALIADO");
    });
    if (preenchidosNaoAvaliados.length > 0) return "NAO_AVALIADO";
    if (medicao.length > 0 && medicao.every((r) => r.status === "NAO_AVALIADO" || r.avaliacao === "NAO_AVALIADO" || !r.status)) {
      return "NAO_AVALIADO";
    }
    const rest = medicao.filter((r) => r.status !== "NA" && r.status !== "APROVADO" && r.avaliacao !== "APROVADO");
    if (rest.some((r) => r.status === "NAO_AVALIADO" || r.avaliacao === "NAO_AVALIADO" || !r.status)) return "NAO_AVALIADO";
    if (medicao.length === 0 && checks.length === 0) return "NAO_AVALIADO";
    return "APROVADO";
  }
  if (respostas.some((r) => r.status === "NAO" || r.status === "REPROVADO")) return "REPROVADO";
  if (respostas.some((r) => !!r.observacao?.trim() && r.status !== "NAO" && r.status !== "NA")) return "APROVADO_COM_RESSALVAS";
  if (!respostas.length) return "NAO_AVALIADO";
  return "APROVADO";
}

export function statusCertificadoNaData(
  validade: Date | string | null | undefined,
  dataServico: Date | string = new Date(),
  diasAlerta = 60,
): StatusCertificadoNaData {
  if (!validade) return "SEM_CERTIFICADO";
  const v = validade instanceof Date ? validade : new Date(validade);
  const d = dataServico instanceof Date ? dataServico : new Date(dataServico);
  if (Number.isNaN(v.getTime()) || Number.isNaN(d.getTime())) return "SEM_CERTIFICADO";
  const dias = (v.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (dias < 0) return "VENCIDO";
  if (dias <= diasAlerta) return "A_VENCER";
  return "VALIDO";
}

function asDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function certificadoVigenteNaData(
  certificados: CertificadoPadraoRef[] | undefined,
  dataServico: Date | string,
): CertificadoPadraoRef | null {
  if (!certificados?.length) return null;
  const data = asDate(dataServico) ?? new Date();
  const cobrindo = certificados.filter((c) => {
    const emi = asDate(c.dataEmissao);
    const val = asDate(c.dataValidade);
    if (!val) return false;
    return (emi ?? new Date(0)).getTime() <= data.getTime() && data.getTime() <= val.getTime();
  });
  cobrindo.sort((a, b) => (asDate(b.dataEmissao)?.getTime() ?? 0) - (asDate(a.dataEmissao)?.getTime() ?? 0));
  if (cobrindo[0]) return cobrindo[0];
  const anteriores = certificados.filter((c) => {
    const emi = asDate(c.dataEmissao);
    return !emi || emi.getTime() <= data.getTime();
  });
  anteriores.sort((a, b) => (asDate(b.dataValidade)?.getTime() ?? 0) - (asDate(a.dataValidade)?.getTime() ?? 0));
  return anteriores[0] ?? certificados[0] ?? null;
}

export function snapshotInstrumentoNaData(args: {
  instrumento: {
    id: string;
    nome: string;
    nSerie: string;
    fabricante?: string | null;
    modelo?: string | null;
    codigoPatrimonio?: string | null;
    tipoAnalisador?: string | null;
    identificacaoExterna?: string | null;
    certificadoNumero?: string | null;
    certificadoValidade?: Date | string | null;
    laboratorioEmissor?: string | null;
  };
  certificados?: CertificadoPadraoRef[];
  dataServico: Date | string;
  diasAlerta?: number;
}) {
  const cert = certificadoVigenteNaData(args.certificados, args.dataServico);
  const validade = cert?.dataValidade ?? args.instrumento.certificadoValidade;
  const statusNaData = statusCertificadoNaData(validade, args.dataServico, args.diasAlerta ?? 60);
  const identificacao = [args.instrumento.nSerie, args.instrumento.codigoPatrimonio, args.instrumento.identificacaoExterna]
    .filter(Boolean)
    .join(" · ");
  return {
    instrumentoId: args.instrumento.id,
    nome: args.instrumento.nome,
    nSerie: args.instrumento.nSerie,
    identificacao,
    tipoAnalisador: args.instrumento.tipoAnalisador ?? null,
    fabricante: args.instrumento.fabricante ?? null,
    modelo: args.instrumento.modelo ?? null,
    origemMedicao: "MANUAL" as const,
    certificado: cert || validade
      ? {
          id: cert?.id,
          numero: cert?.numero ?? args.instrumento.certificadoNumero ?? null,
          dataEmissao: asDate(cert?.dataEmissao)?.toISOString() ?? null,
          dataValidade: asDate(validade)?.toISOString() ?? null,
          laboratorioEmissor: cert?.laboratorioEmissor ?? args.instrumento.laboratorioEmissor ?? null,
          statusNaData,
          pontos: (cert?.pontos ?? []).map((p) => ({ ...p })),
        }
      : null,
  };
}

export function avisoAssinaturaNaoCertificada(): string {
  return "A identificação de quem finalizou registra autoria e data. Não constitui assinatura digital certificada (ICP-Brasil ou equivalente).";
}
