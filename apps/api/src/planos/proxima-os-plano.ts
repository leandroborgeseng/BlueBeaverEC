/**
 * Helpers: próxima OS após conclusão de teste do plano de manutenção.
 * Delega ao motor de ocorrências: sem duplicar, sem cumprir via corretiva,
 * reprovado não avança a próxima data.
 */
import {
  type PrismaClient,
  ResultadoLaudo,
  TipoLaudo,
  TipoOS,
  TipoTestePlano,
} from "@prisma/client";
import { addMonths, resultadoFechaCiclo, tipoOsDaAtividade } from "./plano-regras";
import { registrarExecucaoPlano, tipoOsFromLaudo as tipoOsFromAtividade } from "./plano-ocorrencia";

export { addMonths, resultadoFechaCiclo };

export function tipoOsFromLaudo(tipo: TipoLaudo | TipoTestePlano | string): TipoOS {
  return tipoOsFromAtividade(String(tipo));
}

type PrismaLike = PrismaClient;

/**
 * Fecha o ciclo da ocorrência (se o tipo cumprir o plano) e só avança a próxima
 * data quando o resultado aprova. Não cria OS futura automaticamente.
 */
export async function agendarProximaOsPlano(
  prisma: PrismaLike,
  opts: {
    estabelecimentoId: string;
    equipamentoId: string;
    tipo: TipoLaudo | TipoTestePlano | string;
    dataExecucao: Date;
    periodicidadeMeses: number;
    resultado: ResultadoLaudo;
    observacao?: string;
    osId?: string | null;
    osNumero?: number | null;
    laudoId?: string | null;
    checklist?: unknown;
    executorNome?: string | null;
    executorId?: string | null;
    usuarioId?: string | null;
  },
): Promise<{ concluidaId?: string; proximaId?: string; proximaNumero?: number } | null> {
  const tipoOs = tipoOsDaAtividade(String(opts.tipo));
  const r = await registrarExecucaoPlano({
    prisma,
    estabelecimentoId: opts.estabelecimentoId,
    equipamentoId: opts.equipamentoId,
    tipoOs,
    resultado: opts.resultado,
    dataExecucao: opts.dataExecucao,
    osId: opts.osId,
    osNumero: opts.osNumero,
    laudoId: opts.laudoId,
    checklist: opts.checklist,
    executorNome: opts.executorNome,
    executorId: opts.executorId,
    usuarioId: opts.usuarioId,
  });
  if (!r) return null;
  return {
    concluidaId: r.ocorrenciaId,
    proximaId: r.avancou ? r.ocorrenciaId : undefined,
  };
}
