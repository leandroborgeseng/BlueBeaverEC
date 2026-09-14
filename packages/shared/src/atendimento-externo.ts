/** Fornecedores, contratos de manutenção e encaminhamento externo — sem alçada financeira inventada. */

export const TIPOS_CONTRATO = ["MANUTENCAO", "OUTRO"] as const;
export type TipoContrato = (typeof TIPOS_CONTRATO)[number];

export const LABEL_TIPO_CONTRATO: Record<TipoContrato, string> = {
  MANUTENCAO: "Contrato de manutenção",
  OUTRO: "Outro contrato (não é garantia)",
};

export const PERIODICIDADES_CONTRATO = ["UNICA", "MENSAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"] as const;
export type PeriodicidadeContrato = (typeof PERIODICIDADES_CONTRATO)[number];

export const LABEL_PERIODICIDADE_CONTRATO: Record<PeriodicidadeContrato, string> = {
  UNICA: "Valor único",
  MENSAL: "Mensal",
  TRIMESTRAL: "Trimestral",
  SEMESTRAL: "Semestral",
  ANUAL: "Anual",
};

export const STATUS_ATENDIMENTO_EXTERNO = [
  "ORCAMENTO",
  "ORCAMENTO_RECEBIDO",
  "DECISAO",
  "ENVIADO",
  "AGUARDANDO_RETORNO",
  "RETORNADO",
  "CONFERENCIA",
  "LIBERADO",
  "CANCELADO",
] as const;
export type StatusAtendimentoExterno = (typeof STATUS_ATENDIMENTO_EXTERNO)[number];

export const LABEL_STATUS_ATENDIMENTO: Record<StatusAtendimentoExterno, string> = {
  ORCAMENTO: "Orçamento",
  ORCAMENTO_RECEBIDO: "Orçamento recebido",
  DECISAO: "Decisão registrada",
  ENVIADO: "Enviado ao fornecedor",
  AGUARDANDO_RETORNO: "Aguardando retorno",
  RETORNADO: "Retornou",
  CONFERENCIA: "Conferência técnica",
  LIBERADO: "Liberado para uso",
  CANCELADO: "Cancelado",
};

export const DECISOES_ORCAMENTO = ["PENDENTE", "APROVADO", "REPROVADO"] as const;
export type DecisaoOrcamento = (typeof DECISOES_ORCAMENTO)[number];

export const LABEL_DECISAO_ORCAMENTO: Record<DecisaoOrcamento, string> = {
  PENDENTE: "Pendente",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
};

export const MODOS_DECISAO_ORCAMENTO = ["APROVACAO_INTERNA", "AUTORIZACAO_EXTERNA"] as const;
export type ModoDecisaoOrcamento = (typeof MODOS_DECISAO_ORCAMENTO)[number];

export const LABEL_MODO_DECISAO: Record<ModoDecisaoOrcamento, string> = {
  APROVACAO_INTERNA: "Aprovação interna (mesma política da OS)",
  AUTORIZACAO_EXTERNA: "Decisão autorizada fora do sistema",
};

export const ACOES_ATENDIMENTO_EXTERNO = [
  "registrar_orcamento",
  "decidir",
  "enviar",
  "previsao",
  "retornar",
  "conferir",
  "cancelar",
] as const;
export type AcaoAtendimentoExterno = (typeof ACOES_ATENDIMENTO_EXTERNO)[number];

export const STATUS_ATENDIMENTO_ATIVOS: StatusAtendimentoExterno[] = [
  "ORCAMENTO",
  "ORCAMENTO_RECEBIDO",
  "DECISAO",
  "ENVIADO",
  "AGUARDANDO_RETORNO",
  "RETORNADO",
  "CONFERENCIA",
];

export const STATUS_FORA_HOSPITAL: StatusAtendimentoExterno[] = ["ENVIADO", "AGUARDANDO_RETORNO"];
export const STATUS_PENDENCIA_RETORNO: StatusAtendimentoExterno[] = [
  "ENVIADO",
  "AGUARDANDO_RETORNO",
  "RETORNADO",
  "CONFERENCIA",
];

export function atendimentoEstaAtivo(status: StatusAtendimentoExterno): boolean {
  return STATUS_ATENDIMENTO_ATIVOS.includes(status);
}

/** Não abre segundo encaminhamento na mesma OS enquanto houver um ativo. */
export function podeAbrirEncaminhamento(statusAtivosNaOs: StatusAtendimentoExterno[]): {
  ok: true;
} | { ok: false; erro: string } {
  const ativo = statusAtivosNaOs.find((s) => atendimentoEstaAtivo(s));
  if (ativo) {
    return {
      ok: false,
      erro: "Esta OS já tem encaminhamento externo em andamento. Não abra outra OS nem duplicar o envio.",
    };
  }
  return { ok: true };
}

export function transicaoAtendimentoExterno(
  atual: StatusAtendimentoExterno,
  acao: AcaoAtendimentoExterno,
  ctx: {
    temOrcamento?: boolean;
    decisao?: DecisaoOrcamento | null;
    previsaoRetorno?: boolean;
    conferenciaOk?: boolean;
    condicaoFinal?: "APTO" | "RESTRITO" | "PARADO" | null;
  } = {},
): { ok: true; proximo: StatusAtendimentoExterno } | { ok: false; erro: string } {
  if (atual === "CANCELADO" || atual === "LIBERADO") {
    return { ok: false, erro: "Encaminhamento encerrado" };
  }

  if (acao === "cancelar") {
    if (STATUS_FORA_HOSPITAL.includes(atual)) {
      return { ok: false, erro: "Equipamento fora do hospital: registre o retorno antes de cancelar" };
    }
    return { ok: true, proximo: "CANCELADO" };
  }

  if (acao === "registrar_orcamento") {
    if (atual !== "ORCAMENTO" && atual !== "ORCAMENTO_RECEBIDO" && atual !== "DECISAO") {
      return { ok: false, erro: "Não é possível registrar orçamento neste passo" };
    }
    return { ok: true, proximo: "ORCAMENTO_RECEBIDO" };
  }

  if (acao === "decidir") {
    if (atual !== "ORCAMENTO_RECEBIDO" && atual !== "DECISAO") {
      return { ok: false, erro: "Receba o orçamento antes de registrar a decisão" };
    }
    if (!ctx.temOrcamento) return { ok: false, erro: "Informe ao menos uma versão de orçamento" };
    if (ctx.decisao !== "APROVADO" && ctx.decisao !== "REPROVADO") {
      return { ok: false, erro: "Decisão deve ser aprovado ou reprovado" };
    }
    return { ok: true, proximo: "DECISAO" };
  }

  if (acao === "enviar") {
    if (atual !== "DECISAO") return { ok: false, erro: "Registre a decisão antes do envio" };
    if (ctx.decisao !== "APROVADO") {
      return { ok: false, erro: "Só envia com orçamento aprovado — o sistema não despacha sozinho ao fornecedor" };
    }
    return { ok: true, proximo: ctx.previsaoRetorno ? "AGUARDANDO_RETORNO" : "ENVIADO" };
  }

  if (acao === "previsao") {
    if (atual !== "ENVIADO" && atual !== "AGUARDANDO_RETORNO") {
      return { ok: false, erro: "Previsão de retorno só após o envio" };
    }
    return { ok: true, proximo: "AGUARDANDO_RETORNO" };
  }

  if (acao === "retornar") {
    if (atual !== "ENVIADO" && atual !== "AGUARDANDO_RETORNO") {
      return { ok: false, erro: "Registre o envio antes do retorno" };
    }
    return { ok: true, proximo: "RETORNADO" };
  }

  if (acao === "conferir") {
    if (atual !== "RETORNADO" && atual !== "CONFERENCIA") {
      return { ok: false, erro: "Conferência técnica só depois do retorno físico" };
    }
    if (ctx.conferenciaOk) {
      if (!ctx.condicaoFinal) return { ok: false, erro: "Informe a condição final após a conferência" };
      return { ok: true, proximo: "LIBERADO" };
    }
    if (ctx.condicaoFinal === "APTO") {
      return { ok: false, erro: "Não libere para uso sem conferência técnica aprovada" };
    }
    return { ok: true, proximo: "CONFERENCIA" };
  }

  return { ok: false, erro: "Ação inválida" };
}

/** Garantia de aquisição nunca vira contrato de manutenção. */
export function tipoContratoValido(tipo?: string | null): tipo is TipoContrato {
  return tipo === "MANUTENCAO" || tipo === "OUTRO";
}

export function recusarContratoComoGarantia(tipo?: string | null): string | null {
  const t = String(tipo ?? "").toUpperCase();
  if (t.includes("GARANTIA")) {
    return "Garantia de aquisição fica no equipamento, não no cadastro de contrato de manutenção.";
  }
  if (tipo && !tipoContratoValido(tipo)) return "Tipo de contrato inválido";
  return null;
}

export function situacaoVigencia(
  vigenciaFim: Date | string,
  diasAlerta = 30,
  agora: Date | string = new Date(),
): "VIGENTE" | "A_VENCER" | "VENCIDO" {
  const fim = new Date(vigenciaFim).getTime();
  const now = new Date(agora).getTime();
  const dias = (fim - now) / (1000 * 60 * 60 * 24);
  if (dias < 0) return "VENCIDO";
  const janela = Math.max(1, diasAlerta);
  if (dias <= janela) return "A_VENCER";
  return "VIGENTE";
}

export function alertaVencimentoDias(
  vigenciaFim: Date | string,
  agora: Date | string = new Date(),
): "VENCIDO" | "30" | "60" | "90" | null {
  const dias = (new Date(vigenciaFim).getTime() - new Date(agora).getTime()) / (1000 * 60 * 60 * 24);
  if (dias < 0) return "VENCIDO";
  if (dias <= 30) return "30";
  if (dias <= 60) return "60";
  if (dias <= 90) return "90";
  return null;
}

export interface OrcamentoCusto {
  versao: number;
  valor: number;
  decisao: DecisaoOrcamento;
}

export function custosEncaminhamento(
  orcamentos: OrcamentoCusto[],
  realizado?: number | null,
): { informado: number | null; aprovado: number | null; realizado: number | null } {
  const ordenados = [...orcamentos].sort((a, b) => a.versao - b.versao);
  const ultimo = ordenados.at(-1);
  const aprovado = [...ordenados].reverse().find((o) => o.decisao === "APROVADO");
  return {
    informado: ultimo ? ultimo.valor : null,
    aprovado: aprovado ? aprovado.valor : null,
    realizado: realizado == null ? null : realizado,
  };
}

export function validarDecisaoOrcamento(input: {
  modo: ModoDecisaoOrcamento;
  temAprovacaoInterna: boolean;
  responsavelExterno?: string | null;
  dataExterna?: string | null;
}): { ok: true } | { ok: false; erro: string } {
  if (input.modo === "APROVACAO_INTERNA") {
    if (!input.temAprovacaoInterna) {
      return {
        ok: false,
        erro: "Sem alçada interna neste perfil. Registre decisão autorizada fora do sistema, com responsável e data.",
      };
    }
    return { ok: true };
  }
  if (!input.responsavelExterno?.trim() || !input.dataExterna) {
    return {
      ok: false,
      erro: "Autorização externa exige responsável e data — o Nexo não inventa alçada financeira nem envia ao fornecedor.",
    };
  }
  return { ok: true };
}

export function podeLiberarUso(opts: {
  status: StatusAtendimentoExterno;
  conferenciaOk: boolean;
  condicaoFinal?: "APTO" | "RESTRITO" | "PARADO" | null;
}): { ok: true } | { ok: false; erro: string } {
  if (opts.status !== "LIBERADO" && opts.status !== "CONFERENCIA" && opts.status !== "RETORNADO") {
    if (STATUS_FORA_HOSPITAL.includes(opts.status)) {
      return { ok: false, erro: "Conferência técnica é obrigatória antes de liberar o uso" };
    }
  }
  if (opts.condicaoFinal === "APTO" && !opts.conferenciaOk) {
    return { ok: false, erro: "Conferência técnica é obrigatória antes de liberar o uso" };
  }
  return { ok: true };
}

export function localizacaoDuranteAssistencia(fornecedorNome: string): string {
  const nome = fornecedorNome.trim() || "fornecedor";
  return `Fora do hospital · assistência ${nome}`;
}
