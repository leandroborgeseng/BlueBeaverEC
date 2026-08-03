import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TipoMovimentoEstoque } from "@prisma/client";
import { podeEditarCadastros } from "@aion/shared";
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

  async movimentos(estabelecimentoId: string, itemCodigo?: string) {
    return this.prisma.estoqueMovimento.findMany({
      where: {
        estabelecimentoId,
        ...(itemCodigo
          ? { estoqueItem: { codigo: { equals: itemCodigo, mode: "insensitive" } } }
          : {}),
      },
      include: { estoqueItem: { select: { codigo: true, descricao: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
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
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    const qtd = data.qtdAtual ?? 0;
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.estoqueItem.create({
        data: {
          estabelecimentoId: user.estabelecimentoId,
          codigo: data.codigo.trim(),
          descricao: data.descricao.trim(),
          almoxarifado: data.almoxarifado ?? "Principal",
          qtdAtual: qtd,
          qtdMinima: data.qtdMinima ?? 0,
          valorUnitario: data.valorUnitario ?? 0,
        },
      });
      if (qtd > 0) {
        await tx.estoqueMovimento.create({
          data: {
            estabelecimentoId: user.estabelecimentoId,
            estoqueItemId: item.id,
            tipo: TipoMovimentoEstoque.ENTRADA,
            quantidade: qtd,
            motivo: "Saldo inicial",
            usuarioId: user.userId,
          },
        });
      }
      return item;
    });
  }

  async entrada(user: AuthUser, itemCodigo: string, qtd: number, motivo?: string) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    if (qtd <= 0) throw new BadRequestException("Quantidade inválida");
    const item = await this.findItem(user.estabelecimentoId, itemCodigo);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.estoqueItem.update({
        where: { id: item.id },
        data: { qtdAtual: { increment: qtd } },
      });
      await tx.estoqueMovimento.create({
        data: {
          estabelecimentoId: user.estabelecimentoId,
          estoqueItemId: item.id,
          tipo: TipoMovimentoEstoque.ENTRADA,
          quantidade: qtd,
          motivo: motivo?.trim() || "Entrada manual",
          usuarioId: user.userId,
        },
      });
      return updated;
    });
  }

  async baixar(user: AuthUser, itemCodigo: string, qtd: number, osNumero: number) {
    const item = await this.findItem(user.estabelecimentoId, itemCodigo);
    const os = await this.findOs(user.estabelecimentoId, osNumero);

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
      await tx.estoqueMovimento.create({
        data: {
          estabelecimentoId: user.estabelecimentoId,
          estoqueItemId: item.id,
          tipo: TipoMovimentoEstoque.BAIXA,
          quantidade: qtd,
          motivo: `Baixa OS-${osNumero}`,
          osNumero,
          usuarioId: user.userId,
        },
      });
      return updated;
    });
  }

  async reservar(user: AuthUser, itemCodigo: string, qtd: number, osNumero: number) {
    const item = await this.findItem(user.estabelecimentoId, itemCodigo);
    const os = await this.findOs(user.estabelecimentoId, osNumero);

    return this.prisma.$transaction(async (tx) => {
      const reserva = await tx.estoqueReserva.create({
        data: {
          estoqueItemId: item.id,
          ordemServicoId: os.id,
          quantidade: qtd,
          ativa: true,
        },
      });
      await tx.estoqueMovimento.create({
        data: {
          estabelecimentoId: user.estabelecimentoId,
          estoqueItemId: item.id,
          tipo: TipoMovimentoEstoque.RESERVA,
          quantidade: qtd,
          motivo: `Reserva OS-${osNumero}`,
          osNumero,
          usuarioId: user.userId,
        },
      });
      return reserva;
    });
  }

  async solicitarRepos(user: AuthUser, itemCodigo: string, qtd: number, observacao?: string) {
    if (qtd <= 0) throw new BadRequestException("Quantidade inválida");
    const item = await this.findItem(user.estabelecimentoId, itemCodigo);
    return this.prisma.estoqueMovimento.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        estoqueItemId: item.id,
        tipo: TipoMovimentoEstoque.REPOSICAO_SOLICITADA,
        quantidade: qtd,
        motivo: observacao?.trim() || "Solicitação de reposição",
        usuarioId: user.userId,
      },
      include: { estoqueItem: { select: { codigo: true, descricao: true, qtdAtual: true, qtdMinima: true } } },
    });
  }

  async liberarReservasDaOs(ordemServicoId: string) {
    await this.prisma.estoqueReserva.updateMany({
      where: { ordemServicoId, ativa: true },
      data: { ativa: false },
    });
  }

  listComponentes(estabelecimentoId: string) {
    return this.prisma.componenteRecuperado.findMany({
      where: { estabelecimentoId },
      include: {
        equipamentoOrigem: true,
        equipamentoDestino: true,
      },
      orderBy: { dataRetirada: "desc" },
    });
  }

  async createComponente(
    user: AuthUser,
    data: { itemDescricao: string; equipamentoOrigemTag: string; dataRetirada?: string },
  ) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    const origem = await this.prisma.equipamento.findUnique({
      where: {
        estabelecimentoId_tag: {
          estabelecimentoId: user.estabelecimentoId,
          tag: data.equipamentoOrigemTag,
        },
      },
    });
    if (!origem) throw new NotFoundException("Equipamento de origem não encontrado");

    return this.prisma.componenteRecuperado.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        itemDescricao: data.itemDescricao.trim(),
        equipamentoOrigemId: origem.id,
        dataRetirada: data.dataRetirada ? new Date(data.dataRetirada) : new Date(),
      },
      include: { equipamentoOrigem: true },
    });
  }

  async updateComponente(
    user: AuthUser,
    id: string,
    data: {
      situacao: "EM_RASTREAMENTO" | "REAPROVEITADO" | "DESCARTADO";
      equipamentoDestinoTag?: string;
      osDestinoNumero?: number;
    },
  ) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    const comp = await this.prisma.componenteRecuperado.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!comp) throw new NotFoundException();

    let destinoId: string | undefined;
    if (data.equipamentoDestinoTag) {
      const dest = await this.prisma.equipamento.findUnique({
        where: {
          estabelecimentoId_tag: {
            estabelecimentoId: user.estabelecimentoId,
            tag: data.equipamentoDestinoTag,
          },
        },
      });
      if (!dest) throw new NotFoundException("Equipamento destino não encontrado");
      destinoId = dest.id;
    }

    return this.prisma.componenteRecuperado.update({
      where: { id },
      data: {
        situacao: data.situacao,
        equipamentoDestinoId: destinoId,
        osDestinoNumero: data.osDestinoNumero,
      },
      include: { equipamentoOrigem: true, equipamentoDestino: true },
    });
  }

  private async findItem(estabelecimentoId: string, itemCodigo: string) {
    const item = await this.prisma.estoqueItem.findUnique({
      where: { estabelecimentoId_codigo: { estabelecimentoId, codigo: itemCodigo } },
    });
    if (!item) throw new NotFoundException("Item de estoque não encontrado");
    return item;
  }

  private async findOs(estabelecimentoId: string, osNumero: number) {
    const os = await this.prisma.ordemServico.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId, numero: osNumero } },
    });
    if (!os) throw new NotFoundException("OS não encontrada");
    return os;
  }
}
