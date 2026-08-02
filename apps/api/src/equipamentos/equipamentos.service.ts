import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SituacaoEquipamento } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";
import { podeEditarCadastros } from "@nexo/shared";

@Injectable()
export class EquipamentosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    estabelecimentoId: string,
    query: {
      setor?: string;
      fabricante?: string;
      modelo?: string;
      situacao?: SituacaoEquipamento;
      q?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const where: Prisma.EquipamentoWhereInput = {
      estabelecimentoId,
      ...(query.setor ? { setorId: query.setor } : {}),
      ...(query.fabricante ? { fabricanteId: query.fabricante } : {}),
      ...(query.modelo ? { modeloId: query.modelo } : {}),
      ...(query.situacao ? { situacao: query.situacao } : {}),
      ...(query.q
        ? {
            OR: [
              { tag: { contains: query.q, mode: "insensitive" } },
              { nome: { contains: query.q, mode: "insensitive" } },
              { patrimonio: { contains: query.q, mode: "insensitive" } },
              { nSerie: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.equipamento.count({ where }),
      this.prisma.equipamento.findMany({
        where,
        include: {
          setor: true,
          fabricante: true,
          modelo: true,
          descricao: true,
        },
        orderBy: { tag: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { total, page, pageSize, items };
  }

  async byTag(estabelecimentoId: string, tag: string, verValores: boolean) {
    const eq = await this.prisma.equipamento.findUnique({
      where: { estabelecimentoId_tag: { estabelecimentoId, tag } },
      include: {
        setor: true,
        fabricante: true,
        modelo: true,
        descricao: true,
        fornecedor: true,
        centroCusto: true,
        historicoTags: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });

    if (!eq) {
      throw new NotFoundException(`Equipamento ${tag} não encontrado`);
    }

    if (!verValores) {
      const { valorAquisicao: _a, valorSubstituicao: _s, ...rest } = eq;
      return { ...rest, valorAquisicao: null, valorSubstituicao: null };
    }

    return eq;
  }

  async byQr(estabelecimentoId: string, codigo: string) {
    return this.byTag(estabelecimentoId, codigo, false);
  }

  async updateTag(user: AuthUser, tag: string, novaTag: string, justificativa: string) {
    if (!podeEditarCadastros(user.perfil)) {
      throw new ForbiddenException("Somente Engenheiro/Gestor pode alterar TAG");
    }
    if (!justificativa?.trim()) {
      throw new BadRequestException("Justificativa obrigatória");
    }

    const atual = await this.prisma.equipamento.findUnique({
      where: {
        estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag },
      },
    });
    if (!atual) {
      throw new NotFoundException(`Equipamento ${tag} não encontrado`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.historicoTag.create({
        data: {
          equipamentoId: atual.id,
          tagAnterior: atual.tag,
          tagNova: novaTag.trim(),
          justificativa: justificativa.trim(),
          usuarioId: user.userId,
        },
      });
      return tx.equipamento.update({
        where: { id: atual.id },
        data: { tag: novaTag.trim() },
      });
    });
  }

  async arquivar(user: AuthUser, tag: string) {
    if (!podeEditarCadastros(user.perfil)) {
      throw new ForbiddenException();
    }
    const eq = await this.prisma.equipamento.findUnique({
      where: {
        estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag },
      },
    });
    if (!eq) throw new NotFoundException();

    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.userId,
        acao: "ARQUIVAR_EQUIPAMENTO",
        detalhe: tag,
      },
    });

    return this.prisma.equipamento.update({
      where: { id: eq.id },
      data: { situacao: SituacaoEquipamento.ARQUIVADO },
    });
  }

  async reativar(user: AuthUser, tag: string) {
    if (!podeEditarCadastros(user.perfil)) {
      throw new ForbiddenException();
    }
    const eq = await this.prisma.equipamento.findUnique({
      where: {
        estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag },
      },
    });
    if (!eq) throw new NotFoundException();

    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.userId,
        acao: "REATIVAR_EQUIPAMENTO",
        detalhe: tag,
      },
    });

    return this.prisma.equipamento.update({
      where: { id: eq.id },
      data: { situacao: SituacaoEquipamento.ATIVO },
    });
  }
}
