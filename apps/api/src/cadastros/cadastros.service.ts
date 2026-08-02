import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Criticidade } from "@prisma/client";
import { podeEditarCadastros } from "@nexo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class CadastrosService {
  constructor(private readonly prisma: PrismaService) {}

  private assertEdit(user: AuthUser) {
    if (!podeEditarCadastros(user.perfil)) {
      throw new ForbiddenException("Somente Engenheiro/Gestor pode editar cadastros");
    }
  }

  fabricantes(estabelecimentoId: string, q?: string) {
    return this.prisma.fabricante.findMany({
      where: {
        estabelecimentoId,
        ativo: true,
        ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}),
      },
      orderBy: { nome: "asc" },
      take: 100,
    });
  }

  async createFabricante(user: AuthUser, nome: string) {
    this.assertEdit(user);
    return this.prisma.fabricante.create({
      data: { estabelecimentoId: user.estabelecimentoId, nome: nome.trim() },
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
      take: 100,
    });
  }

  async createModelo(user: AuthUser, fabricanteId: string, nome: string) {
    this.assertEdit(user);
    const fab = await this.prisma.fabricante.findFirst({
      where: { id: fabricanteId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!fab) throw new NotFoundException("Fabricante não encontrado");
    return this.prisma.modelo.create({
      data: { fabricanteId, nome: nome.trim() },
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

  async createSetor(user: AuthUser, nome: string) {
    this.assertEdit(user);
    return this.prisma.setor.create({
      data: { estabelecimentoId: user.estabelecimentoId, nome: nome.trim() },
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
      take: 100,
    });
  }

  async createFornecedor(user: AuthUser, nome: string, cnpj?: string) {
    this.assertEdit(user);
    return this.prisma.fornecedor.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        nome: nome.trim(),
        cnpj: cnpj?.trim() || null,
      },
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

  async createPlano(
    user: AuthUser,
    data: { nome: string; criticidade?: Criticidade; vidaUtilAnos?: number },
  ) {
    this.assertEdit(user);
    return this.prisma.planoDescricao.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        nome: data.nome.trim(),
        criticidade: data.criticidade ?? Criticidade.MEDIA,
        vidaUtilAnos: data.vidaUtilAnos ?? 10,
      },
    });
  }

  async updatePlano(
    user: AuthUser,
    id: string,
    data: { nome?: string; criticidade?: Criticidade; vidaUtilAnos?: number },
  ) {
    this.assertEdit(user);
    const plano = await this.prisma.planoDescricao.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!plano) throw new NotFoundException();
    return this.prisma.planoDescricao.update({
      where: { id },
      data: {
        ...(data.nome ? { nome: data.nome.trim() } : {}),
        ...(data.criticidade ? { criticidade: data.criticidade } : {}),
        ...(data.vidaUtilAnos != null ? { vidaUtilAnos: data.vidaUtilAnos } : {}),
      },
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
      take: 100,
    });
  }
}
