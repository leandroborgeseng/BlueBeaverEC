import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrioridadeOS, Prisma, ResultadoLaudo, StatusOS, TipoLaudo, TipoOS } from "@prisma/client";
import {
  PERMISSAO_NIVEL,
  SLA_HORAS,
  podeAlterarStatusOS,
  podeExecutarAcaoStatusOS,
  temPermissao,
  type PrioridadeOS as PrioridadeShared,
} from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

const TIPOS_OS_EXIGEM_LAUDO: TipoOS[] = [
  TipoOS.PREVENTIVA,
  TipoOS.CALIBRACAO,
  TipoOS.TSE,
  TipoOS.QUALIFICACAO,
];

const RESULTADOS_LAUDO_OK: ResultadoLaudo[] = [
  ResultadoLaudo.APROVADO,
  ResultadoLaudo.APROVADO_COM_RESSALVAS,
];

@Injectable()
export class OsService {
  constructor(private readonly prisma: PrismaService) {}

  private isAtrasada(prioridade: PrioridadeOS, abertura: Date, fechamento: Date | null, status: StatusOS) {
    if (fechamento || status === StatusOS.CANCELADA || status === StatusOS.CONCLUIDA) {
      return false;
    }
    const horas = SLA_HORAS[prioridade as PrioridadeShared];
    const limite = new Date(abertura.getTime() + horas * 60 * 60 * 1000);
    return Date.now() > limite.getTime();
  }

  async list(
    estabelecimentoId: string,
    query: {
      situacao?: StatusOS;
      prioridade?: PrioridadeOS;
      q?: string;
      setor?: string;
      oficina?: string;
      atrasada?: boolean;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.OrdemServicoWhereInput = {
      estabelecimentoId,
      ...(query.situacao ? { status: query.situacao } : {}),
      ...(query.prioridade ? { prioridade: query.prioridade } : {}),
      ...(query.oficina ? { oficina: { contains: query.oficina, mode: "insensitive" } } : {}),
      ...(query.setor
        ? { equipamento: { setor: { nome: { contains: query.setor, mode: "insensitive" } } } }
        : {}),
      ...(query.q
        ? {
            OR: [
              { codigo: { contains: query.q, mode: "insensitive" } },
              { equipamento: { tag: { contains: query.q, mode: "insensitive" } } },
              { equipamento: { nome: { contains: query.q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.ordemServico.count({ where }),
      this.prisma.ordemServico.findMany({
        where,
        include: {
          equipamento: { include: { setor: true, descricao: true } },
          responsavel: true,
        },
        orderBy: [{ prioridade: "desc" }, { abertura: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    let items = rows.map((os) => ({
      ...os,
      atrasada: this.isAtrasada(os.prioridade, os.abertura, os.fechamento, os.status),
    }));
    if (query.atrasada === true) {
      items = items.filter((o) => o.atrasada);
    }

    return {
      total: query.atrasada === true ? items.length : total,
      page,
      pageSize,
      items,
    };
  }

  async getByNumero(estabelecimentoId: string, numero: number) {
    const os = await this.prisma.ordemServico.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId, numero } },
      include: {
        equipamento: {
          include: { setor: true, descricao: true, fabricante: true, modelo: true },
        },
        responsavel: true,
        itens: { include: { estoqueItem: true } },
        solicitacao: true,
        logs: {
          include: { usuario: { select: { nome: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });
    if (!os) throw new NotFoundException(`OS ${numero} não encontrada`);
    return {
      ...os,
      atrasada: this.isAtrasada(os.prioridade, os.abertura, os.fechamento, os.status),
    };
  }

  async updatePendencia(user: AuthUser, numero: number, pendencia: string | null) {
    if (!podeAlterarStatusOS(user.perfil)) {
      throw new ForbiddenException("Sem permissão para alterar pendência");
    }
    const os = await this.findByNumero(user.estabelecimentoId, numero);
    return this.prisma.ordemServico.update({
      where: { id: os.id },
      data: { pendencia: pendencia?.trim() || null },
    });
  }

  async naoAtribuidas(estabelecimentoId: string) {
    const rows = await this.prisma.ordemServico.findMany({
      where: { estabelecimentoId, status: StatusOS.NAO_ATRIBUIDA },
      include: { equipamento: true },
      orderBy: [{ prioridade: "desc" }, { abertura: "asc" }],
    });
    return rows.map((os) => ({
      ...os,
      atrasada: this.isAtrasada(os.prioridade, os.abertura, os.fechamento, os.status),
    }));
  }

  async ativasDoEquipamento(estabelecimentoId: string, tag: string) {
    return this.prisma.ordemServico.findMany({
      where: {
        estabelecimentoId,
        equipamento: { tag },
        status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] },
      },
      select: { numero: true, status: true, prioridade: true },
    });
  }

  async log(estabelecimentoId: string, numero: number) {
    const os = await this.findByNumero(estabelecimentoId, numero);
    return this.prisma.logOrdemServico.findMany({
      where: { ordemServicoId: os.id },
      include: { usuario: { select: { nome: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async auditoria(
    estabelecimentoId: string,
    filtros: { acao?: string; numero?: number } = {},
  ) {
    return this.prisma.logOrdemServico.findMany({
      where: {
        ordemServico: {
          estabelecimentoId,
          ...(filtros.numero ? { numero: filtros.numero } : {}),
        },
        ...(filtros.acao ? { acao: filtros.acao } : {}),
      },
      include: {
        usuario: { select: { nome: true, email: true } },
        ordemServico: { select: { numero: true, codigo: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async create(
    user: AuthUser,
    data: {
      equipamentoTag: string;
      tipo?: TipoOS;
      prioridade?: PrioridadeOS;
      oficina?: string;
      observacaoRequisicao?: string;
      pendencia?: string;
      responsavelId?: string;
      solicitacaoId?: string;
      pecas?: Array<{ itemCodigo: string; qtd: number }>;
      maoDeObra?: { descricao: string; horas: number; valorHora?: number };
      deslocamentoKm?: number;
      servicoExecutado?: string;
    },
  ) {
    const equipamento = await this.prisma.equipamento.findUnique({
      where: {
        estabelecimentoId_tag: {
          estabelecimentoId: user.estabelecimentoId,
          tag: data.equipamentoTag,
        },
      },
      include: { descricao: true },
    });
    if (!equipamento) {
      throw new NotFoundException("Equipamento não encontrado");
    }

    const ativas = await this.ativasDoEquipamento(user.estabelecimentoId, data.equipamentoTag);
    const avisoDuplicidade =
      ativas.length > 0
        ? `Já existe OS #${ativas.map((a) => a.numero).join(", ")} em aberto para este equipamento`
        : null;

    const alertaCriticoUrgente =
      data.prioridade === PrioridadeOS.URGENTE && equipamento.descricao.criticidade === "ALTA"
        ? "Prioridade URGENTE em equipamento de criticidade ALTA"
        : null;

    const numero = await this.nextNumero(user.estabelecimentoId);
    const status = data.responsavelId ? StatusOS.ABERTA : StatusOS.NAO_ATRIBUIDA;

    const os = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ordemServico.create({
        data: {
          estabelecimentoId: user.estabelecimentoId,
          numero,
          codigo: `OS-${String(numero).padStart(5, "0")}`,
          equipamentoId: equipamento.id,
          tipo: data.tipo ?? TipoOS.CORRETIVA,
          prioridade: data.prioridade ?? PrioridadeOS.MEDIA,
          oficina: data.oficina,
          observacaoRequisicao: data.observacaoRequisicao,
          pendencia: data.pendencia,
          responsavelId: data.responsavelId,
          solicitacaoId: data.solicitacaoId,
          status,
          logs: {
            create: {
              usuarioId: user.userId,
              acao: "ABERTURA",
            },
          },
        },
        include: { equipamento: true, responsavel: true },
      });

      for (const peca of data.pecas ?? []) {
        const item = await tx.estoqueItem.findUnique({
          where: {
            estabelecimentoId_codigo: {
              estabelecimentoId: user.estabelecimentoId,
              codigo: peca.itemCodigo,
            },
          },
        });
        if (!item) {
          throw new NotFoundException(`Peça ${peca.itemCodigo} não encontrada no estoque`);
        }
        await tx.ordemServicoItem.create({
          data: {
            ordemServicoId: created.id,
            tipo: "MATERIAL",
            descricao: item.descricao,
            quantidade: peca.qtd,
            valorUnitario: item.valorUnitario,
            estoqueItemId: item.id,
          },
        });
        await tx.estoqueReserva.create({
          data: {
            estoqueItemId: item.id,
            ordemServicoId: created.id,
            quantidade: peca.qtd,
            ativa: true,
          },
        });
      }

      if (data.maoDeObra?.descricao) {
        await tx.ordemServicoItem.create({
          data: {
            ordemServicoId: created.id,
            tipo: "MAO_DE_OBRA",
            descricao: data.maoDeObra.descricao,
            quantidade: data.maoDeObra.horas || 1,
            valorUnitario: data.maoDeObra.valorHora ?? 0,
          },
        });
      }

      if (data.deslocamentoKm && data.deslocamentoKm > 0) {
        await tx.ordemServicoItem.create({
          data: {
            ordemServicoId: created.id,
            tipo: "MAO_DE_OBRA",
            descricao: `Deslocamento ${data.deslocamentoKm} km`,
            quantidade: data.deslocamentoKm,
            valorUnitario: 0,
          },
        });
      }

      if (data.servicoExecutado) {
        await tx.logOrdemServico.create({
          data: {
            ordemServicoId: created.id,
            usuarioId: user.userId,
            acao: "SERVICO_EXECUTADO",
            justificativa: data.servicoExecutado,
          },
        });
      }

      return created;
    });

    return { ...os, avisoDuplicidade, alertaCriticoUrgente };
  }

  /** Abertura + execução em um passo (§4.3). */
  async rapida(
    user: AuthUser,
    data: {
      equipamentoTag: string;
      tipo?: TipoOS;
      prioridade?: PrioridadeOS;
      oficina?: string;
      observacaoRequisicao?: string;
      responsavelId?: string;
      pecas?: Array<{ itemCodigo: string; qtd: number }>;
      maoDeObra?: { descricao: string; horas: number; valorHora?: number };
      deslocamentoKm?: number;
      servicoExecutado?: string;
      fechar?: boolean;
    },
  ) {
    const created = await this.create(user, {
      ...data,
      responsavelId: data.responsavelId,
    });

    if (data.fechar) {
      if (!data.responsavelId) {
        throw new BadRequestException("Informe responsável para fechar a OS Rápida");
      }
      const fechada = await this.changeStatus(user, created.numero, "fechar", data.servicoExecutado);
      return { ...fechada, avisoDuplicidade: created.avisoDuplicidade, alertaCriticoUrgente: created.alertaCriticoUrgente, fechada: true };
    }

    return { ...created, fechada: false };
  }

  async atribuir(user: AuthUser, numero: number, responsavelId: string) {
    if (!podeAlterarStatusOS(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException("Somente o Engenheiro pode atribuir OS");
    }
    const os = await this.findByNumero(user.estabelecimentoId, numero);
    return this.prisma.ordemServico.update({
      where: { id: os.id },
      data: {
        responsavelId,
        status: StatusOS.ABERTA,
        logs: {
          create: { usuarioId: user.userId, acao: "ATRIBUICAO" },
        },
      },
    });
  }

  /**
   * Preventiva/calibração/TSE/QLF só fecham com laudo aprovado vinculado (osNumero)
   * ou override de engenheiro com justificativa.
   */
  async assertLaudoAprovadoParaFechar(
    user: AuthUser,
    os: { numero: number; tipo: TipoOS; equipamentoId: string },
    justificativa?: string,
  ) {
    if (!TIPOS_OS_EXIGEM_LAUDO.includes(os.tipo)) return;

    const tipoLaudo = os.tipo as unknown as TipoLaudo;
    const laudo = await this.prisma.laudo.findFirst({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        equipamentoId: os.equipamentoId,
        tipo: tipoLaudo,
        osNumero: os.numero,
        resultado: { in: RESULTADOS_LAUDO_OK },
      },
      select: { id: true, numero: true },
    });
    if (laudo) return;

    const podeOverride =
      Boolean(justificativa?.trim()) &&
      temPermissao(user.permissoesModulos, "os", PERMISSAO_NIVEL.EDICAO_APROVACAO);
    if (podeOverride) return;

    throw new ConflictException(
      `Não é possível fechar OS ${os.tipo} sem laudo aprovado vinculado (nº OS ${os.numero}). ` +
        "Engenheiro pode justificar o override.",
    );
  }

  async changeStatus(
    user: AuthUser,
    numero: number,
    acao: "fechar" | "cancelar" | "reabrir" | "iniciar" | "pausar",
    justificativa?: string,
  ) {
    if (!podeExecutarAcaoStatusOS(user.perfil, acao, user.permissoesModulos)) {
      throw new ForbiddenException("Sem permissão para alterar o status desta OS");
    }

    const os = await this.findByNumero(user.estabelecimentoId, numero);

    if (acao === "iniciar") {
      if (os.status !== StatusOS.ABERTA && os.status !== StatusOS.NAO_ATRIBUIDA) {
        throw new ConflictException("Só é possível iniciar OS aberta ou não atribuída");
      }
      return this.prisma.ordemServico.update({
        where: { id: os.id },
        data: {
          status: StatusOS.EM_ANDAMENTO,
          logs: { create: { usuarioId: user.userId, acao: "INICIO_EXECUCAO", justificativa } },
        },
      });
    }

    if (acao === "pausar") {
      if (os.status !== StatusOS.EM_ANDAMENTO) {
        throw new ConflictException("Só é possível pausar OS em andamento");
      }
      return this.prisma.ordemServico.update({
        where: { id: os.id },
        data: {
          status: os.responsavelId ? StatusOS.ABERTA : StatusOS.NAO_ATRIBUIDA,
          logs: { create: { usuarioId: user.userId, acao: "PAUSA", justificativa } },
        },
      });
    }

    if (acao === "fechar") {
      if (os.pendencia?.trim()) {
        throw new ConflictException("Não é possível fechar OS com pendência aberta");
      }
      await this.assertLaudoAprovadoParaFechar(user, os, justificativa);
      return this.prisma.$transaction(async (tx) => {
        const reservas = await tx.estoqueReserva.findMany({
          where: { ordemServicoId: os.id, ativa: true },
        });
        for (const r of reservas) {
          await tx.estoqueItem.update({
            where: { id: r.estoqueItemId },
            data: { qtdAtual: { decrement: r.quantidade } },
          });
        }
        await tx.estoqueReserva.updateMany({
          where: { ordemServicoId: os.id, ativa: true },
          data: { ativa: false },
        });
        return tx.ordemServico.update({
          where: { id: os.id },
          data: {
            status: StatusOS.CONCLUIDA,
            fechamento: new Date(),
            logs: { create: { usuarioId: user.userId, acao: "FECHAMENTO", justificativa } },
          },
        });
      });
    }

    if (acao === "cancelar") {
      if (!justificativa?.trim()) {
        throw new BadRequestException("Justificativa obrigatória para cancelar");
      }
      return this.prisma.$transaction(async (tx) => {
        await tx.estoqueReserva.updateMany({
          where: { ordemServicoId: os.id, ativa: true },
          data: { ativa: false },
        });
        return tx.ordemServico.update({
          where: { id: os.id },
          data: {
            status: StatusOS.CANCELADA,
            fechamento: new Date(),
            logs: {
              create: {
                usuarioId: user.userId,
                acao: "CANCELAMENTO",
                justificativa: justificativa.trim(),
              },
            },
          },
        });
      });
    }

    if (!justificativa?.trim()) {
      throw new BadRequestException("Justificativa obrigatória para reabrir");
    }
    return this.prisma.ordemServico.update({
      where: { id: os.id },
      data: {
        status: os.responsavelId ? StatusOS.ABERTA : StatusOS.NAO_ATRIBUIDA,
        fechamento: null,
        logs: {
          create: {
            usuarioId: user.userId,
            acao: "REABERTURA",
            justificativa: justificativa.trim(),
          },
        },
      },
    });
  }

  async minhasOs(estabelecimentoId: string, tecnicoColaboradorId: string) {
    const rows = await this.prisma.ordemServico.findMany({
      where: {
        estabelecimentoId,
        responsavelId: tecnicoColaboradorId,
        status: { in: [StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] },
      },
      include: { equipamento: { include: { setor: true } } },
      orderBy: [{ prioridade: "desc" }, { abertura: "asc" }],
    });
    return rows.map((os) => ({
      ...os,
      atrasada: this.isAtrasada(os.prioridade, os.abertura, os.fechamento, os.status),
    }));
  }

  private async findByNumero(estabelecimentoId: string, numero: number) {
    const os = await this.prisma.ordemServico.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId, numero } },
    });
    if (!os) throw new NotFoundException(`OS ${numero} não encontrada`);
    return os;
  }

  private async nextNumero(estabelecimentoId: string) {
    const row = await this.prisma.contadorSequencia.upsert({
      where: {
        estabelecimentoId_chave: { estabelecimentoId, chave: "OS" },
      },
      create: { estabelecimentoId, chave: "OS", valor: 1 },
      update: { valor: { increment: 1 } },
    });
    return row.valor;
  }
}
