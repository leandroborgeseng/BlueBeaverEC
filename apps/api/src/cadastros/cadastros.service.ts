import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CadastrosService {
  constructor(private readonly prisma: PrismaService) {}

  fabricantes(estabelecimentoId: string, q?: string) {
    return this.prisma.fabricante.findMany({
      where: {
        estabelecimentoId,
        ativo: true,
        ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { nome: "asc" },
      take: 50,
    });
  }

  modelos(estabelecimentoId: string, fabricanteId?: string, q?: string) {
    return this.prisma.modelo.findMany({
      where: {
        ativo: true,
        fabricante: { estabelecimentoId },
        ...(fabricanteId ? { fabricanteId } : {}),
        ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}),
      },
      include: { fabricante: { select: { id: true, nome: true } } },
      orderBy: { nome: "asc" },
      take: 50,
    });
  }

  setores(estabelecimentoId: string, q?: string) {
    return this.prisma.setor.findMany({
      where: {
        estabelecimentoId,
        ativo: true,
        ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { nome: "asc" },
    });
  }

  fornecedores(estabelecimentoId: string, q?: string) {
    return this.prisma.fornecedor.findMany({
      where: {
        estabelecimentoId,
        ativo: true,
        ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { nome: "asc" },
      take: 50,
    });
  }

  planosDescricao(estabelecimentoId: string, q?: string) {
    return this.prisma.planoDescricao.findMany({
      where: {
        estabelecimentoId,
        ativo: true,
        ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { nome: "asc" },
    });
  }

  centrosCusto(estabelecimentoId: string) {
    return this.prisma.centroCusto.findMany({
      where: { estabelecimentoId, ativo: true },
      orderBy: { codigo: "asc" },
    });
  }

  colaboradores(estabelecimentoId: string, q?: string) {
    return this.prisma.colaborador.findMany({
      where: {
        estabelecimentoId,
        ativo: true,
        ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { nome: "asc" },
      take: 50,
    });
  }
}
