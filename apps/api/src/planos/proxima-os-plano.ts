/**
 * Helpers: próxima OS após conclusão de teste do plano de manutenção.
 */
import {
  PrioridadeOS,
  type PrismaClient,
  ResultadoLaudo,
  StatusOS,
  TipoLaudo,
  TipoOS,
  TipoTestePlano,
} from "@prisma/client";

type PrismaLike = Pick<PrismaClient, "contadorSequencia" | "ordemServico">;

export function tipoOsFromLaudo(tipo: TipoLaudo | TipoTestePlano | string): TipoOS {
  switch (tipo) {
    case "PREVENTIVA":
      return TipoOS.PREVENTIVA;
    case "CALIBRACAO":
      return TipoOS.CALIBRACAO;
    case "TSE":
      return TipoOS.TSE;
    case "QUALIFICACAO":
      return TipoOS.QUALIFICACAO;
    default:
      return TipoOS.CORRETIVA;
  }
}

export function addMonths(base: Date, months: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function resultadoFechaCiclo(resultado: ResultadoLaudo): boolean {
  return (
    resultado === ResultadoLaudo.APROVADO || resultado === ResultadoLaudo.APROVADO_COM_RESSALVAS
  );
}

async function nextOsNumero(prisma: PrismaLike, estabId: string) {
  const row = await prisma.contadorSequencia.upsert({
    where: { estabelecimentoId_chave: { estabelecimentoId: estabId, chave: "OS" } },
    create: { estabelecimentoId: estabId, chave: "OS", valor: 1 },
    update: { valor: { increment: 1 } },
  });
  return row.valor;
}

/**
 * Fecha OS abertas do mesmo tipo e abre a próxima com abertura = dataExecucao + periodicidade.
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
  },
): Promise<{ concluidaId?: string; proximaId?: string; proximaNumero?: number } | null> {
  if (!resultadoFechaCiclo(opts.resultado)) return null;
  if (!opts.periodicidadeMeses || opts.periodicidadeMeses < 1) return null;

  const tipoOs = tipoOsFromLaudo(opts.tipo);
  if (tipoOs === TipoOS.CORRETIVA) return null;

  const abertas = await prisma.ordemServico.findMany({
    where: {
      estabelecimentoId: opts.estabelecimentoId,
      equipamentoId: opts.equipamentoId,
      tipo: tipoOs,
      status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] },
    },
  });

  let concluidaId: string | undefined;
  for (const os of abertas) {
    await prisma.ordemServico.update({
      where: { id: os.id },
      data: {
        status: StatusOS.CONCLUIDA,
        fechamento: opts.dataExecucao,
        pendencia: null,
      },
    });
    concluidaId = os.id;
  }

  const proximaExecucao = addMonths(opts.dataExecucao, opts.periodicidadeMeses);

  const jaExiste = await prisma.ordemServico.findFirst({
    where: {
      estabelecimentoId: opts.estabelecimentoId,
      equipamentoId: opts.equipamentoId,
      tipo: tipoOs,
      status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA] },
      abertura: {
        gte: new Date(proximaExecucao.getTime() - 24 * 60 * 60 * 1000),
        lte: new Date(proximaExecucao.getTime() + 24 * 60 * 60 * 1000),
      },
    },
  });
  if (jaExiste) {
    return { concluidaId, proximaId: jaExiste.id, proximaNumero: jaExiste.numero };
  }

  const numero = await nextOsNumero(prisma, opts.estabelecimentoId);
  const proxima = await prisma.ordemServico.create({
    data: {
      estabelecimentoId: opts.estabelecimentoId,
      numero,
      codigo: `OS-${String(numero).padStart(4, "0")}`,
      equipamentoId: opts.equipamentoId,
      tipo: tipoOs,
      prioridade: PrioridadeOS.MEDIA,
      status: StatusOS.ABERTA,
      abertura: proximaExecucao,
      pendencia: `Agendada pelo plano (${opts.periodicidadeMeses} meses)`,
      observacaoRequisicao:
        opts.observacao ??
        `Próxima execução automática após laudo (${opts.periodicidadeMeses} meses).`,
    },
  });

  return { concluidaId, proximaId: proxima.id, proximaNumero: numero };
}
