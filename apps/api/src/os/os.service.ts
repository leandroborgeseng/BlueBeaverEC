import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrioridadeOS, Prisma, StatusOS, TipoOS } from "@prisma/client";
import { SLA_HORAS, podeAlterarStatusOS, type PrioridadeOS as PrioridadeShared } from "@nexo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

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
    query: { situacao?: StatusOS; q?: string; page?: number },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = 20;
    const where: Prisma.OrdemServicoWhereInput = {
      estabelecimentoId,
      ...(query.situacao ? { status: query.situacao } : {}),
      ...(query.q
        ? {
            OR: [
              { codigo: { contains: query.q, mode: "insensitive" } },
              { equipamento: { tag: { contains: query.q, mode: "insensitive" } } },
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

    return {
      total,
      page,
      pageSize,
      items: rows.map((os) => ({
        ...os,
        atrasada: this.isAtrasada(os.prioridade, os.abertura, os.fechamento, os.status),
      })),
    };
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
    },
  ) {
    const equipamento = await this.prisma.equipamento.findUnique({
      where: {
        estabelecimentoId_tag: {
          estabelecimentoId: user.estabelecimentoId,
          tag: data.equipamentoTag,
        },
      },
    });
    if (!equipamento) {
      throw new NotFoundException("Equipamento não encontrado");
    }

    const ativas = await this.ativasDoEquipamento(user.estabelecimentoId, data.equipamentoTag);
    const avisoDuplicidade =
      ativas.length > 0
        ? `Já existe OS #${ativas.map((a) => a.numero).join(", ")} em aberto para este equipamento`
        : null;

    const numero = await this.nextNumero(user.estabelecimentoId);
    const status = data.responsavelId ? StatusOS.ABERTA : StatusOS.NAO_ATRIBUIDA;

    const os = await this.prisma.ordemServico.create({
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

    return { ...os, avisoDuplicidade };
  }

  async atribuir(user: AuthUser, numero: number, responsavelId: string) {
    if (!podeAlterarStatusOS(user.perfil)) {
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

  async changeStatus(
    user: AuthUser,
    numero: number,
    acao: "fechar" | "cancelar" | "reabrir",
    justificativa?: string,
  ) {
    if (!podeAlterarStatusOS(user.perfil)) {
      throw new ForbiddenException("Somente o Engenheiro pode alterar o status desta OS");
    }

    const os = await this.findByNumero(user.estabelecimentoId, numero);

    if (acao === "fechar") {
      if (os.pendencia?.trim()) {
        throw new ConflictException("Não é possível fechar OS com pendência aberta");
      }
      return this.prisma.ordemServico.update({
        where: { id: os.id },
        data: {
          status: StatusOS.CONCLUIDA,
          fechamento: new Date(),
          logs: { create: { usuarioId: user.userId, acao: "FECHAMENTO", justificativa } },
        },
      });
    }

    if (acao === "cancelar") {
      if (!justificativa?.trim()) {
        throw new BadRequestException("Justificativa obrigatória para cancelar");
      }
      return this.prisma.ordemServico.update({
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
