import {
  PrioridadeOS,
  Prisma,
  PrismaClient,
  StatusOS,
  StatusSolicitacao,
  TipoOS,
  UrgenciaSolicitacao,
} from "@prisma/client";

type Db = Pick<
  PrismaClient,
  "setor" | "equipamento" | "ordemServico" | "solicitacaoServico" | "contadorSequencia"
>;

export function mapUrgenciaParaPrioridade(urgencia: UrgenciaSolicitacao): PrioridadeOS {
  switch (urgencia) {
    case UrgenciaSolicitacao.PARADA_CRITICA:
      return PrioridadeOS.URGENTE;
    case UrgenciaSolicitacao.ALTA:
      return PrioridadeOS.ALTA;
    case UrgenciaSolicitacao.BAIXA:
      return PrioridadeOS.BAIXA;
    default:
      return PrioridadeOS.MEDIA;
  }
}

export function observacaoDaSolicitacao(sol: {
  protocolo: string;
  descricao: string;
  solicitanteNome: string;
  ramal?: string | null;
  setorNome: string;
}): string {
  const ramal = sol.ramal?.trim() ? `Ramal: ${sol.ramal.trim()}` : "Ramal: não informado";
  return [
    `Pedido ${sol.protocolo} — ${sol.descricao.trim()}`,
    `Solicitante: ${sol.solicitanteNome}`,
    ramal,
    `Setor: ${sol.setorNome}`,
  ].join("\n");
}

export async function findSetorByNome(prisma: Db, estabelecimentoId: string, nome: string) {
  return prisma.setor.findFirst({
    where: {
      estabelecimentoId,
      nome: { equals: nome.trim(), mode: "insensitive" },
    },
  });
}

export async function nextNumeroOs(prisma: Db, estabelecimentoId: string) {
  const row = await prisma.contadorSequencia.upsert({
    where: { estabelecimentoId_chave: { estabelecimentoId, chave: "OS" } },
    create: { estabelecimentoId, chave: "OS", valor: 1 },
    update: { valor: { increment: 1 } },
  });
  return row.valor;
}

const osInclude = {
  equipamento: { include: { setor: true } },
  setor: true,
  responsavel: true,
} as const;

export async function converterSolicitacaoEmOs(
  prisma: Db,
  sol: {
    id: string;
    estabelecimentoId: string;
    protocolo: string;
    descricao: string;
    solicitanteNome: string;
    ramal?: string | null;
    setorNome: string;
    urgencia: UrgenciaSolicitacao;
    equipamentoId?: string | null;
    status: StatusSolicitacao;
  },
  opts: { usuarioId?: string; responsavelId?: string } = {},
) {
  const existing = await prisma.ordemServico.findUnique({
    where: { solicitacaoId: sol.id },
    include: osInclude,
  });
  if (existing) {
    if (sol.status !== StatusSolicitacao.CONVERTIDA) {
      await prisma.solicitacaoServico.update({
        where: { id: sol.id },
        data: { status: StatusSolicitacao.CONVERTIDA },
      });
    }
    return { os: existing, created: false };
  }

  let setorId: string | null = null;
  if (sol.equipamentoId) {
    const eq = await prisma.equipamento.findUnique({ where: { id: sol.equipamentoId } });
    setorId = eq?.setorId ?? null;
  }
  if (!setorId) {
    const setor = await findSetorByNome(prisma, sol.estabelecimentoId, sol.setorNome);
    setorId = setor?.id ?? null;
  }

  const numero = await nextNumeroOs(prisma, sol.estabelecimentoId);
  const status = opts.responsavelId ? StatusOS.ABERTA : StatusOS.NAO_ATRIBUIDA;

  try {
    const os = await prisma.ordemServico.create({
      data: {
        estabelecimentoId: sol.estabelecimentoId,
        numero,
        codigo: `OS-${String(numero).padStart(5, "0")}`,
        equipamentoId: sol.equipamentoId ?? null,
        setorId,
        tipo: TipoOS.CORRETIVA,
        prioridade: mapUrgenciaParaPrioridade(sol.urgencia),
        observacaoRequisicao: observacaoDaSolicitacao(sol),
        responsavelId: opts.responsavelId,
        solicitacaoId: sol.id,
        status,
        logs: {
          create: {
            usuarioId: opts.usuarioId,
            acao: "ABERTURA",
            justificativa: "OS gerada automaticamente a partir do pedido do solicitante",
          },
        },
      },
      include: osInclude,
    });

    await prisma.solicitacaoServico.update({
      where: { id: sol.id },
      data: { status: StatusSolicitacao.CONVERTIDA },
    });

    return { os, created: true };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await prisma.ordemServico.findUnique({
        where: { solicitacaoId: sol.id },
        include: osInclude,
      });
      if (again) {
        await prisma.solicitacaoServico.update({
          where: { id: sol.id },
          data: { status: StatusSolicitacao.CONVERTIDA },
        });
        return { os: again, created: false };
      }
    }
    throw e;
  }
}
