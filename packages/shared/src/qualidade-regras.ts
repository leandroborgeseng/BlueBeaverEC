/**
 * Regras de documentos controlados, treinamentos e ocorrências de segurança.
 * Registro operacional interno — não declara conformidade regulatória.
 * Sem dados de paciente, sem notificação externa automática, sem selo.
 */

export const CATEGORIAS_DOCUMENTO_CONTROLADO = ["PROCEDIMENTO", "INSTRUCAO", "INSTITUCIONAL"] as const;
export type CategoriaDocumentoControlado = (typeof CATEGORIAS_DOCUMENTO_CONTROLADO)[number];

export const STATUS_DOCUMENTO_CONTROLADO = ["RASCUNHO", "VIGENTE", "OBSOLETO"] as const;
export type StatusDocumentoControlado = (typeof STATUS_DOCUMENTO_CONTROLADO)[number];

export const ORIGENS_DOCUMENTO_CONTROLADO = ["INSTITUCIONAL", "BIBLIOTECA_POP"] as const;
export type OrigemDocumentoControlado = (typeof ORIGENS_DOCUMENTO_CONTROLADO)[number];

export const TIPOS_VINCULO_DOCUMENTO = ["EQUIPAMENTO", "MODELO", "INTERVENCAO", "SETOR"] as const;
export type TipoVinculoDocumento = (typeof TIPOS_VINCULO_DOCUMENTO)[number];

export const TIPOS_TREINAMENTO = ["INICIAL", "RECICLAGEM", "EDUCACAO_CONTINUADA"] as const;
export type TipoTreinamentoQualidade = (typeof TIPOS_TREINAMENTO)[number];

export const TIPOS_OCORRENCIA_SEGURANCA = ["FALHA", "INCIDENTE", "SUSPEITA_EVENTO_ADVERSO"] as const;
export type TipoOcorrenciaSeguranca = (typeof TIPOS_OCORRENCIA_SEGURANCA)[number];

export const STATUS_OCORRENCIA_SEGURANCA = [
  "ABERTA",
  "EM_INVESTIGACAO",
  "ACOES_EM_ANDAMENTO",
  "CONCLUIDA",
] as const;
export type StatusOcorrenciaSeguranca = (typeof STATUS_OCORRENCIA_SEGURANCA)[number];

export const TIPOS_ALERTA_CAMPO = ["ALERTA_FABRICANTE", "RECOLHIMENTO", "ACAO_DE_CAMPO"] as const;
export type TipoAlertaCampo = (typeof TIPOS_ALERTA_CAMPO)[number];

export const STATUS_ALERTA_CAMPO = ["ABERTO", "EM_ANDAMENTO", "CONCLUIDO"] as const;
export type StatusAlertaCampo = (typeof STATUS_ALERTA_CAMPO)[number];

export const LABEL_CATEGORIA_DOCUMENTO: Record<CategoriaDocumentoControlado, string> = {
  PROCEDIMENTO: "Procedimento",
  INSTRUCAO: "Instrução de trabalho",
  INSTITUCIONAL: "Documento institucional",
};

export const LABEL_STATUS_DOCUMENTO: Record<StatusDocumentoControlado, string> = {
  RASCUNHO: "Rascunho",
  VIGENTE: "Vigente",
  OBSOLETO: "Obsoleto",
};

export const LABEL_ORIGEM_DOCUMENTO: Record<OrigemDocumentoControlado, string> = {
  INSTITUCIONAL: "Procedimento institucional",
  BIBLIOTECA_POP: "Vinculado à biblioteca de POPs",
};

export const LABEL_VINCULO_DOCUMENTO: Record<TipoVinculoDocumento, string> = {
  EQUIPAMENTO: "Equipamento",
  MODELO: "Modelo",
  INTERVENCAO: "Tipo de intervenção",
  SETOR: "Setor",
};

export const LABEL_TIPO_TREINAMENTO: Record<TipoTreinamentoQualidade, string> = {
  INICIAL: "Inicial",
  RECICLAGEM: "Reciclagem",
  EDUCACAO_CONTINUADA: "Educação continuada",
};

export const LABEL_TIPO_OCORRENCIA: Record<TipoOcorrenciaSeguranca, string> = {
  FALHA: "Falha",
  INCIDENTE: "Incidente",
  SUSPEITA_EVENTO_ADVERSO: "Suspeita de evento adverso",
};

export const LABEL_STATUS_OCORRENCIA: Record<StatusOcorrenciaSeguranca, string> = {
  ABERTA: "Aberta",
  EM_INVESTIGACAO: "Em investigação",
  ACOES_EM_ANDAMENTO: "Ações em andamento",
  CONCLUIDA: "Concluída",
};

export const LABEL_TIPO_ALERTA: Record<TipoAlertaCampo, string> = {
  ALERTA_FABRICANTE: "Alerta do fabricante",
  RECOLHIMENTO: "Recolhimento",
  ACAO_DE_CAMPO: "Ação de campo",
};

export const LABEL_STATUS_ALERTA: Record<StatusAlertaCampo, string> = {
  ABERTO: "Aberto",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDO: "Concluído",
};

/** Manual/garantia/NF do equipamento não viram procedimento institucional. */
const TIPOS_DOC_EQUIPAMENTO_NAO_PROCEDIMENTO = new Set(["MANUAL", "GARANTIA", "NOTA_FISCAL"]);

export function manualFabricanteNaoEProcedimento(tipoDocumentoEquipamento?: string | null): boolean {
  if (!tipoDocumentoEquipamento) return false;
  return TIPOS_DOC_EQUIPAMENTO_NAO_PROCEDIMENTO.has(tipoDocumentoEquipamento);
}

export function versaoVigente<T extends { status: string }>(versoes: T[]): T | null {
  return versoes.find((v) => v.status === "VIGENTE") ?? null;
}

export function transicaoStatusDocumento(
  atual: StatusDocumentoControlado | string,
  proximo: StatusDocumentoControlado | string,
): { ok: true } | { ok: false; motivo: string } {
  if (atual === proximo) return { ok: true };
  if (atual === "RASCUNHO" && proximo === "VIGENTE") return { ok: true };
  if (atual === "VIGENTE" && proximo === "OBSOLETO") return { ok: true };
  if (atual === "RASCUNHO" && proximo === "OBSOLETO") return { ok: true };
  return {
    ok: false,
    motivo: `Não é possível passar de ${atual} para ${proximo}. Publique uma nova versão para voltar a vigorar.`,
  };
}

export function efeitoPublicarVersao(vigenteAtualId: string | null, novaVersaoId: string) {
  if (!novaVersaoId) throw new Error("Versão inválida");
  return {
    vigenteId: novaVersaoId,
    obsoletarId: vigenteAtualId && vigenteAtualId !== novaVersaoId ? vigenteAtualId : null,
  };
}

/** Presença em treinamento não atesta competência técnica. */
export function presencaConfereCompetencia(): false {
  return false;
}

export function ocorrenciaESensivel(
  tipo: TipoOcorrenciaSeguranca | string,
  acessoSensivel?: boolean,
): boolean {
  return tipo === "SUSPEITA_EVENTO_ADVERSO" || acessoSensivel === true;
}

const FLUXO_OCORRENCIA: StatusOcorrenciaSeguranca[] = [
  "ABERTA",
  "EM_INVESTIGACAO",
  "ACOES_EM_ANDAMENTO",
  "CONCLUIDA",
];

export function transicaoStatusOcorrencia(
  atual: StatusOcorrenciaSeguranca | string,
  proximo: StatusOcorrenciaSeguranca | string,
): { ok: true } | { ok: false; motivo: string } {
  if (atual === proximo) return { ok: true };
  if (atual === "CONCLUIDA") {
    return { ok: false, motivo: "Ocorrência concluída não reabre por este fluxo." };
  }
  const iAtual = FLUXO_OCORRENCIA.indexOf(atual as StatusOcorrenciaSeguranca);
  const iProx = FLUXO_OCORRENCIA.indexOf(proximo as StatusOcorrenciaSeguranca);
  if (iAtual < 0 || iProx < 0) return { ok: false, motivo: "Status inválido." };
  if (iProx === iAtual + 1) return { ok: true };
  if (atual === "ACOES_EM_ANDAMENTO" && proximo === "EM_INVESTIGACAO") return { ok: true };
  return {
    ok: false,
    motivo: `Transição ${atual} → ${proximo} não é permitida. Acompanhe o fluxo até a conclusão.`,
  };
}

export function podeConcluirOcorrencia(input: {
  medidasImediatas?: string | null;
  investigacoes: number;
  acoes: number;
  acoesAbertas: number;
}): { ok: true } | { ok: false; motivo: string } {
  if (!input.medidasImediatas?.trim()) {
    return { ok: false, motivo: "Registre as medidas imediatas antes de concluir." };
  }
  if (input.investigacoes === 0 && input.acoes === 0) {
    return {
      ok: false,
      motivo: "Registre investigação ou ação antes de concluir. A causalidade não é inferida automaticamente.",
    };
  }
  if (input.acoesAbertas > 0) {
    return { ok: false, motivo: "Há ações em aberto. Conclua-as para encerrar a ocorrência." };
  }
  return { ok: true };
}

/** Investigação e ações nunca preenchem causa sozinhas. */
export function inferirCausalidade(
  _tipo?: string,
  _descricao?: string,
): null {
  return null;
}

export function acoesNaoInferemCausalidade(): true {
  return true;
}

/** Condição de uso do equipamento só muda por ato explícito de profissional autorizado. */
export function aplicarCondicaoUsoAutomaticamente(): false {
  return false;
}

/** Alertas de fabricante/recolhimento/campo são registro manual — sem disparo externo. */
export function alertaPermiteNotificacaoAutomatica(): false {
  return false;
}

export const CAMPOS_PACIENTE_PROIBIDOS = [
  "paciente",
  "pacientenome",
  "nomepaciente",
  "prontuario",
  "cpfpaciente",
  "pacienteid",
  "cns",
  "datanascimento",
];

export function payloadContemDadoPaciente(body: Record<string, unknown> | null | undefined): string | null {
  if (!body || typeof body !== "object") return null;
  for (const key of Object.keys(body)) {
    const compact = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (CAMPOS_PACIENTE_PROIBIDOS.some((p) => compact.includes(p))) {
      return key;
    }
  }
  return null;
}

export function recusarDadoPaciente(body: Record<string, unknown> | null | undefined): void {
  const campo = payloadContemDadoPaciente(body);
  if (campo) {
    throw new Error(`Campo recusado: este módulo não registra dados de paciente (${campo}).`);
  }
}

export type FiltroBuscaQualidade = {
  q?: string;
  tipo?: string;
  setorId?: string;
  equipamentoId?: string;
  de?: string;
  ate?: string;
};

export function periodoBuscaValido(de?: string, ate?: string): { ok: true } | { ok: false; motivo: string } {
  if (!de && !ate) return { ok: true };
  if (de && Number.isNaN(Date.parse(de))) return { ok: false, motivo: "Data inicial inválida." };
  if (ate && Number.isNaN(Date.parse(ate))) return { ok: false, motivo: "Data final inválida." };
  if (de && ate && Date.parse(de) > Date.parse(ate)) {
    return { ok: false, motivo: "O período inicial não pode ser posterior ao final." };
  }
  return { ok: true };
}

export const AVISO_NAO_CONFORMIDADE_REGULATORIA =
  "Registro operacional interno da engenharia clínica. Não constitui declaração de conformidade regulatória nem selo de certificação.";
