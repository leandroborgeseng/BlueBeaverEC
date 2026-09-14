export type PerfilAcesso =
  | "ENGENHEIRO"
  | "GESTOR"
  | "TECNICO"
  | "TECNICO_RESTRITO"
  | "SOLICITANTE"
  | "AUDITORIA"
  | "ADMIN";

export type SituacaoEquipamento =
  | "ATIVO"
  | "EM_GARANTIA"
  | "EM_GARANTIA_ESTENDIDA"
  | "INATIVO"
  | "ARQUIVADO";

export type PrioridadeOS = "BAIXA" | "MEDIA" | "ALTA" | "URGENTE";

export type StatusOS =
  | "NAO_ATRIBUIDA"
  | "ABERTA"
  | "EM_ANDAMENTO"
  | "AGUARDANDO"
  | "CONCLUIDA"
  | "CANCELADA";

export type VisibilidadeOs = "PUBLICO" | "INTERNO";

export type CondicaoUsoEquipamento = "APTO" | "RESTRITO" | "PARADO";

/** OS ainda em curso (não concluída/cancelada). */
export const STATUS_OS_ATIVAS: StatusOS[] = [
  "NAO_ATRIBUIDA",
  "ABERTA",
  "EM_ANDAMENTO",
  "AGUARDANDO",
];

export const LABEL_STATUS_OS: Record<StatusOS, string> = {
  NAO_ATRIBUIDA: "Aberta",
  ABERTA: "Atribuída",
  EM_ANDAMENTO: "Em atendimento",
  AGUARDANDO: "Aguardando",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const LABEL_CONDICAO_USO: Record<CondicaoUsoEquipamento, string> = {
  APTO: "Apto para uso",
  RESTRITO: "Uso restrito",
  PARADO: "Parado",
};

export type PropriedadeEquipamento = "PROPRIO" | "LOCADO" | "COMODATO" | "OUTRO";

export const LABEL_PROPRIEDADE: Record<PropriedadeEquipamento, string> = {
  PROPRIO: "Próprio",
  LOCADO: "Locado",
  COMODATO: "Comodato",
  OUTRO: "Outra (configurável)",
};

export const LABEL_SITUACAO_CICLO: Record<SituacaoEquipamento, string> = {
  ATIVO: "Em operação",
  EM_GARANTIA: "Em operação (garantia)",
  EM_GARANTIA_ESTENDIDA: "Em operação (garantia estendida)",
  INATIVO: "Desativado",
  ARQUIVADO: "Arquivado",
};

export type TipoMovimentacaoEquipamento =
  | "TRANSFERENCIA_SETOR"
  | "EMPRESTIMO"
  | "ASSISTENCIA"
  | "RETORNO";

export const LABEL_MOVIMENTACAO: Record<TipoMovimentacaoEquipamento, string> = {
  TRANSFERENCIA_SETOR: "Transferência de setor",
  EMPRESTIMO: "Empréstimo",
  ASSISTENCIA: "Assistência técnica",
  RETORNO: "Retorno",
};

export function labelStatusOS(status?: string | null): string {
  if (status && status in LABEL_STATUS_OS) return LABEL_STATUS_OS[status as StatusOS];
  return status?.replace(/_/g, " ") ?? "—";
}

export type TipoOS = "CORRETIVA" | "PREVENTIVA" | "CALIBRACAO" | "TSE" | "QUALIFICACAO";

export type TipoAtividadePlano = "PREVENTIVA" | "CALIBRACAO" | "TSE" | "QUALIFICACAO" | "OUTRO";

export const LABEL_TIPO_ATIVIDADE_PLANO: Record<TipoAtividadePlano, string> = {
  PREVENTIVA: "Preventiva",
  CALIBRACAO: "Calibração",
  TSE: "TSE",
  QUALIFICACAO: "Qualificação",
  OUTRO: "Outro",
};

export type StatusAgendaPlano =
  | "PREVISTA"
  | "A_VENCER"
  | "VENCIDA"
  | "OS_GERADA"
  | "EXECUTADA"
  | "CANCELADA";

export const LABEL_STATUS_AGENDA_PLANO: Record<StatusAgendaPlano, string> = {
  PREVISTA: "Prevista",
  A_VENCER: "A vencer",
  VENCIDA: "Vencida",
  OS_GERADA: "OS gerada",
  EXECUTADA: "Executada",
  CANCELADA: "Cancelada",
};

export type TipoLaudo = "RECEBIMENTO" | "PREVENTIVA" | "CALIBRACAO" | "TSE" | "QUALIFICACAO";

export type ResultadoLaudo =
  | "APROVADO"
  | "REPROVADO"
  | "APROVADO_COM_RESSALVAS"
  | "PENDENTE_ASSINATURA";

/** SLA em horas a partir da abertura, por prioridade (fallback se o tipo não tiver prazo). */
export const SLA_HORAS: Record<PrioridadeOS, number> = {
  URGENTE: 2,
  ALTA: 8,
  MEDIA: 24,
  BAIXA: 72,
};

export type SlaOsInput = {
  abertura: Date | string;
  fechamento?: Date | string | null;
  status: StatusOS | string;
  prioridade: PrioridadeOS | string;
  slaConclusaoHoras?: number | null;
  slaAtendimentoHoras?: number | null;
  agora?: Date | number | string;
};

export type SlaOsCampos = {
  slaLimite: Date;
  slaEstourado: boolean;
  slaMinutosRestantes: number;
  slaHoras: number;
  slaFonte: "tipo" | "prioridade";
};

/** Horas de SLA: tipo do equipamento prevalece; senão prioridade. Sem multiplicador. */
export function horasSlaOs(input: {
  prioridade: PrioridadeOS | string;
  status?: StatusOS | string;
  slaConclusaoHoras?: number | null;
  slaAtendimentoHoras?: number | null;
}): { horas: number; fonte: "tipo" | "prioridade" } {
  const conclusao = Number(input.slaConclusaoHoras);
  const atendimento = Number(input.slaAtendimentoHoras);
  const temConclusao = Number.isFinite(conclusao) && conclusao > 0;
  const temAtendimento = Number.isFinite(atendimento) && atendimento > 0;
  const naoIniciada = !input.status || input.status === "NAO_ATRIBUIDA" || input.status === "ABERTA";
  if (naoIniciada && temAtendimento && !temConclusao) {
    return { horas: atendimento, fonte: "tipo" };
  }
  if (temConclusao) return { horas: conclusao, fonte: "tipo" };
  if (temAtendimento) return { horas: atendimento, fonte: "tipo" };
  const prio = (input.prioridade in SLA_HORAS ? input.prioridade : "MEDIA") as PrioridadeOS;
  return { horas: SLA_HORAS[prio], fonte: "prioridade" };
}

export function calcularSlaOs(input: SlaOsInput): SlaOsCampos {
  const { horas, fonte } = horasSlaOs(input);
  const abertura = new Date(input.abertura).getTime();
  const slaLimite = new Date(abertura + horas * 60 * 60 * 1000);
  const encerrada =
    Boolean(input.fechamento) || input.status === "CONCLUIDA" || input.status === "CANCELADA";
  const ref = encerrada && input.fechamento ? new Date(input.fechamento).getTime() : input.agora != null
    ? new Date(input.agora).getTime()
    : Date.now();
  const slaMinutosRestantes = Math.round((slaLimite.getTime() - ref) / 60_000);
  return {
    slaLimite,
    slaEstourado: !encerrada && slaMinutosRestantes < 0,
    slaMinutosRestantes,
    slaHoras: horas,
    slaFonte: fonte,
  };
}

export function formatarSlaMinutos(minutos: number): string {
  const abs = Math.abs(minutos);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h <= 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export const PERMISSAO_NIVEL = {
  NENHUM: 0,
  LEITURA: 1,
  EDICAO: 2,
  EDICAO_APROVACAO: 3,
} as const;

export type NivelPermissao = (typeof PERMISSAO_NIVEL)[keyof typeof PERMISSAO_NIVEL];

export const MODULOS = [
  "dashboard",
  "equipamentos",
  "os",
  "laudos",
  "estoque",
  "contratos",
  "pessoas",
  "financeiro",
  "auditorias",
  "estrategico",
  "portal",
  "config",
] as const;

export type ModuloPermissao = (typeof MODULOS)[number];

export type MapaPermissoes = Partial<Record<ModuloPermissao, NivelPermissao>>;

const L = PERMISSAO_NIVEL.LEITURA;
const E = PERMISSAO_NIVEL.EDICAO;
const A = PERMISSAO_NIVEL.EDICAO_APROVACAO;
const N = PERMISSAO_NIVEL.NENHUM;

/** Matriz padrão por perfil enum (fallback quando não há PerfilCustom). */
export const PERMISSOES_PADRAO: Record<PerfilAcesso, MapaPermissoes> = {
  ADMIN: {
    dashboard: A,
    equipamentos: A,
    os: A,
    laudos: A,
    estoque: A,
    contratos: A,
    pessoas: A,
    financeiro: A,
    auditorias: A,
    estrategico: A,
    portal: A,
    config: A,
  },
  GESTOR: {
    dashboard: A,
    equipamentos: A,
    os: A,
    laudos: A,
    estoque: A,
    contratos: A,
    pessoas: A,
    financeiro: A,
    auditorias: A,
    estrategico: A,
    portal: E,
    config: E,
  },
  ENGENHEIRO: {
    dashboard: L,
    equipamentos: A,
    os: A,
    laudos: A,
    estoque: E,
    contratos: E,
    pessoas: E,
    financeiro: L,
    auditorias: E,
    estrategico: L,
    portal: E,
    config: E,
  },
  /** Campo: cronograma, OS atribuídas e inventário editável. */
  TECNICO: {
    dashboard: N,
    equipamentos: E,
    os: E,
    laudos: N,
    estoque: N,
    contratos: N,
    pessoas: N,
    financeiro: N,
    auditorias: N,
    estrategico: N,
    portal: N,
    config: N,
  },
  /** Mesmo recorte mínimo do técnico, para o app de campo. */
  TECNICO_RESTRITO: {
    dashboard: N,
    equipamentos: E,
    os: E,
    laudos: N,
    estoque: N,
    contratos: N,
    pessoas: N,
    financeiro: N,
    auditorias: N,
    estrategico: N,
    portal: N,
    config: N,
  },
  /** Portal: só abre OS e consulta o que é do próprio setor. */
  SOLICITANTE: {
    dashboard: N,
    equipamentos: N,
    os: N,
    laudos: N,
    estoque: N,
    contratos: N,
    pessoas: N,
    financeiro: N,
    auditorias: N,
    estrategico: N,
    portal: E,
    config: N,
  },
  AUDITORIA: {
    dashboard: L,
    equipamentos: L,
    os: L,
    laudos: L,
    estoque: L,
    contratos: L,
    pessoas: L,
    financeiro: L,
    auditorias: A,
    estrategico: L,
    portal: N,
    config: N,
  },
};

export interface SessionUser {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilAcesso;
  estabelecimentoId: string;
  estabelecimentoNome: string;
  setorIds: string[];
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export function nivelPermissao(valor: unknown): NivelPermissao {
  if (typeof valor === "number" && valor >= 0 && valor <= 3) return valor as NivelPermissao;
  if (typeof valor === "string") {
    const key = valor.toUpperCase() as keyof typeof PERMISSAO_NIVEL;
    if (key in PERMISSAO_NIVEL) return PERMISSAO_NIVEL[key];
  }
  return PERMISSAO_NIVEL.NENHUM;
}

export function permissoesDoPerfil(
  perfil: PerfilAcesso,
  override?: Record<string, unknown> | null,
): MapaPermissoes {
  const base = { ...PERMISSOES_PADRAO[perfil] };
  if (!override) return base;
  for (const [mod, val] of Object.entries(override)) {
    if ((MODULOS as readonly string[]).includes(mod)) {
      base[mod as ModuloPermissao] = nivelPermissao(val);
    }
  }
  return base;
}

export function temPermissao(
  mapa: MapaPermissoes | undefined,
  modulo: ModuloPermissao,
  minimo: NivelPermissao = PERMISSAO_NIVEL.LEITURA,
): boolean {
  const n = mapa?.[modulo] ?? PERMISSAO_NIVEL.NENHUM;
  return n >= minimo;
}

/** Edição no módulo indicado (mapa JWT ou matriz padrão do perfil). */
export function podeEditarModulo(
  perfil: PerfilAcesso,
  mapa: MapaPermissoes | undefined,
  modulo: ModuloPermissao,
): boolean {
  return temPermissao(mapa ?? permissoesDoPerfil(perfil), modulo, PERMISSAO_NIVEL.EDICAO);
}

/** Cadastro/arquivamento de parque — exige aprovação no módulo `equipamentos`. */
export function podeEditarCadastros(perfil: PerfilAcesso, mapa?: MapaPermissoes): boolean {
  return temPermissao(
    mapa ?? permissoesDoPerfil(perfil),
    "equipamentos",
    PERMISSAO_NIVEL.EDICAO_APROVACAO,
  );
}

/** Aprovar/recusar solicitações, cancelar/reabrir — nível de aprovação. */
export function podeAlterarStatusOS(perfil: PerfilAcesso, mapa?: MapaPermissoes): boolean {
  if (mapa) return temPermissao(mapa, "os", PERMISSAO_NIVEL.EDICAO_APROVACAO);
  return perfil === "ENGENHEIRO" || perfil === "GESTOR" || perfil === "ADMIN";
}

/** Assumir, atribuir e transferir — qualquer colaborador com edição de OS. */
export function podeAtribuirOS(perfil: PerfilAcesso, mapa?: MapaPermissoes): boolean {
  if (mapa) return temPermissao(mapa, "os", PERMISSAO_NIVEL.EDICAO);
  return (
    perfil === "TECNICO" ||
    perfil === "TECNICO_RESTRITO" ||
    perfil === "ENGENHEIRO" ||
    perfil === "GESTOR" ||
    perfil === "ADMIN"
  );
}

/** OS pode ir para qualquer perfil operacional — nunca para o usuário final (solicitante). */
export function podeReceberAtribuicaoOS(perfil?: string | null): boolean {
  return Boolean(perfil) && perfil !== "SOLICITANTE";
}

export const LABEL_PERFIL: Record<PerfilAcesso, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  ENGENHEIRO: "Engenheiro",
  TECNICO: "Técnico",
  TECNICO_RESTRITO: "Técnico de campo",
  SOLICITANTE: "Usuário final",
  AUDITORIA: "Auditoria",
};

export function funcaoResponsavelOS(perfil?: string | null, cargo?: string | null): string {
  const fromCargo = cargo?.trim();
  if (fromCargo) return fromCargo;
  if (perfil && perfil in LABEL_PERFIL) return LABEL_PERFIL[perfil as PerfilAcesso];
  return "Colaborador";
}

export type AcaoStatusOS =
  | "iniciar"
  | "pausar"
  | "aguardar"
  | "retomar"
  | "fechar"
  | "cancelar"
  | "reabrir";

/**
 * Técnico (EDICAO) inicia/pausa/aguarda/fecha execução.
 * Cancelar/reabrir (efetivar) exige EDICAO_APROVACAO (engenheiro/gestor).
 */
export function podeExecutarAcaoStatusOS(
  perfil: PerfilAcesso,
  acao: AcaoStatusOS,
  mapa?: MapaPermissoes,
): boolean {
  const precisaAprovacao = acao === "cancelar" || acao === "reabrir";
  if (mapa) {
    return temPermissao(
      mapa,
      "os",
      precisaAprovacao ? PERMISSAO_NIVEL.EDICAO_APROVACAO : PERMISSAO_NIVEL.EDICAO,
    );
  }
  if (precisaAprovacao) {
    return perfil === "ENGENHEIRO" || perfil === "GESTOR" || perfil === "ADMIN";
  }
  return (
    perfil === "TECNICO" ||
    perfil === "TECNICO_RESTRITO" ||
    perfil === "ENGENHEIRO" ||
    perfil === "GESTOR" ||
    perfil === "ADMIN"
  );
}

export function podeVerFinanceiro(perfil: PerfilAcesso, mapa?: MapaPermissoes): boolean {
  if (mapa) return temPermissao(mapa, "financeiro", PERMISSAO_NIVEL.LEITURA);
  return perfil === "ENGENHEIRO" || perfil === "GESTOR" || perfil === "ADMIN";
}
