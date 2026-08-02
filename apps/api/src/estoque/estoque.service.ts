import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { podeEditarCadastros } from "@nexo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class EstoqueService {
  constructor(private readonly prisma: PrismaService) {}

  async list(estabelecimentoId: string, q?: string) {
    const items = await this.prisma.estoqueItem.findMany({
      where: {
        estabelecimentoId,
        ativo: true,
        ...(q
          ? {
              OR: [
                { codigo: { contains: q, mode: "insensitive" } },
                { descricao: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { codigo: "asc" },
    });

    const withReserva = await Promise.all(
      items.map(async (item) => {
        const reserved = await this.prisma.estoqueReserva.aggregate({
          where: { estoqueItemId: item.id, ativa: true },
          _sum: { quantidade: true },
        });
        const qtdReservada = Number(reserved._sum.quantidade ?? 0);
        const qtdAtual = Number(item.qtdAtual);
        const qtdMinima = Number(item.qtdMinima);
        return {
          ...item,
          qtdAtual,
          qtdMinima,
          qtdReservada,
          disponivel: qtdAtual - qtdReservada,
          status: qtdAtual < qtdMinima ? "ABAIXO_DO_MINIMO" : "NORMAL",
        };
      }),
    );

    return withReserva;
  }

  async create(
    user: AuthUser,
    data: {
      codigo: string;
      descricao: string;
      almoxarifado?: string;
      qtdAtual?: number;
      qtdMinima?: number;
      valorUnitario?: number;
    },
  ) {
    if (!podeEditarCadastros(user.perfil)) throw new ForbiddenException();
    return this.prisma.estoqueItem.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        codigo: data.codigo.trim(),
        descricao: data.descricao.trim(),
        almoxarifado: data.almoxarifado ?? "Principal",
        qtdAtual: data.qtdAtual ?? 0,
        qtdMinima: data.qtdMinima ?? 0,
        valorUnitario: data.valorUnitario ?? 0,
      },
    });
  }

  async baixar(user: AuthUser, itemCodigo: string, qtd: number, osNumero: number) {
    const item = await this.prisma.estoqueItem.findUnique({
      where: {
        estabelecimentoId_codigo: {
          estabelecimentoId: user.estabelecimentoId,
          codigo: itemCodigo,
        },
      },
    });
    if (!item) throw new NotFoundException("Item de estoque não encontrado");

    const os = await this.prisma.ordemServico.findUnique({
      where: {
        estabelecimentoId_numero: {
          estabelecimentoId: user.estabelecimentoId,
          numero: osNumero,
        },
      },
    });
    if (!os) throw new NotFoundException("OS não encontrada");

    // Baixa imediata — saldo negativo permitido
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.estoqueItem.update({
        where: { id: item.id },
        data: { qtdAtual: { decrement: qtd } },
      });
      await tx.ordemServicoItem.create({
        data: {
          ordemServicoId: os.id,
          tipo: "MATERIAL",
          descricao: item.descricao,
          quantidade: qtd,
          valorUnitario: item.valorUnitario,
          estoqueItemId: item.id,
        },
      });
      return updated;
    });
  }

  async reservar(user: AuthUser, itemCodigo: string, qtd: number, osNumero: number) {
    const item = await this.prisma.estoqueItem.findUnique({
      where: {
        estabelecimentoId_codigo: {
          estabelecimentoId: user.estabelecimentoId,
          codigo: itemCodigo,
        },
      },
    });
    if (!item) throw new NotFoundException("Item de estoque não encontrado");

    const os = await this.prisma.ordemServico.findUnique({
      where: {
        estabelecimentoId_numero: {
          estabelecimentoId: user.estabelecimentoId,
          numero: osNumero,
        },
      },
    });
    if (!os) throw new NotFoundException("OS não encontrada");

    return this.prisma.estoqueReserva.create({
      data: {
        estoqueItemId: item.id,
        ordemServicoId: os.id,
        quantidade: qtd,
        ativa: true,
      },
    });
  }

  async liberarReservasDaOs(ordemServicoId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    await db.estoqueReserva.updateMany({
      where: { ordemServicoId, ativa: true },
      data: { ativa: false },
    });
  }
}
