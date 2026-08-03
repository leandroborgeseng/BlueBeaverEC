export type PerfilAcesso =
  | "ENGENHEIRO"
  | "GESTOR"
  | "TECNICO"
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
  | "CONCLUIDA"
  | "CANCELADA";

export type TipoOS = "CORRETIVA" | "PREVENTIVA" | "CALIBRACAO" | "TSE" | "QUALIFICACAO";

export type TipoLaudo = "RECEBIMENTO" | "PREVENTIVA" | "CALIBRACAO" | "TSE" | "QUALIFICACAO";

export type ResultadoLaudo =
  | "APROVADO"
  | "REPROVADO"
  | "APROVADO_COM_RESSALVAS"
  | "PENDENTE_ASSINATURA";

/** SLA em horas a partir da abertura, por prioridade. */
export const SLA_HORAS: Record<PrioridadeOS, number> = {
  URGENTE: 2,
  ALTA: 8,
  MEDIA: 24,
  BAIXA: 72,
};

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
  TECNICO: {
    dashboard: L,
    equipamentos: L,
    os: E,
    laudos: E,
    estoque: L,
    contratos: N,
    pessoas: N,
    financeiro: N,
    auditorias: N,
    estrategico: N,
    portal: L,
    config: N,
  },
  SOLICITANTE: {
    dashboard: N,
    equipamentos: L,
    os: L,
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

/** Cadastros de parque / planos — módulo `equipamentos`. */
export function podeEditarCadastros(perfil: PerfilAcesso, mapa?: MapaPermissoes): boolean {
  return podeEditarModulo(perfil, mapa, "equipamentos");
}

/** Aprovar/recusar solicitações, atribuir OS, cancelar/reabrir — nível de aprovação. */
export function podeAlterarStatusOS(perfil: PerfilAcesso, mapa?: MapaPermissoes): boolean {
  if (mapa) return temPermissao(mapa, "os", PERMISSAO_NIVEL.EDICAO_APROVACAO);
  return perfil === "ENGENHEIRO" || perfil === "GESTOR" || perfil === "ADMIN";
}

export type AcaoStatusOS = "iniciar" | "pausar" | "fechar" | "cancelar" | "reabrir";

/**
 * Técnico (EDICAO) inicia/pausa/fecha execução.
 * Cancelar/reabrir exige EDICAO_APROVACAO (engenheiro/gestor).
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
    perfil === "ENGENHEIRO" ||
    perfil === "GESTOR" ||
    perfil === "ADMIN"
  );
}

export function podeVerFinanceiro(perfil: PerfilAcesso, mapa?: MapaPermissoes): boolean {
  if (mapa) return temPermissao(mapa, "financeiro", PERMISSAO_NIVEL.LEITURA);
  return perfil === "ENGENHEIRO" || perfil === "GESTOR" || perfil === "ADMIN";
}
