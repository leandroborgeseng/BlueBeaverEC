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

export type TipoOS = "CORRETIVA" | "PREVENTIVA" | "CALIBRACAO" | "TSE";

export type TipoLaudo = "RECEBIMENTO" | "PREVENTIVA" | "CALIBRACAO" | "TSE";

export type ResultadoLaudo = "APROVADO" | "REPROVADO" | "APROVADO_COM_RESSALVAS";

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

export function podeEditarCadastros(perfil: PerfilAcesso): boolean {
  return perfil === "ENGENHEIRO" || perfil === "GESTOR" || perfil === "ADMIN";
}

export function podeAlterarStatusOS(perfil: PerfilAcesso): boolean {
  return perfil === "ENGENHEIRO" || perfil === "GESTOR" || perfil === "ADMIN";
}
