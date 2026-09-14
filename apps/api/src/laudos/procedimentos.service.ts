import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { TipoLaudo } from "@prisma/client";
import { PERMISSAO_NIVEL, podeEditarModulo, temPermissao } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class ProcedimentosService {
  constructor(private readonly prisma: PrismaService) {}

  list(estabelecimentoId: string, tipo?: TipoLaudo) {
    return this.prisma.procedimentoLaudo.findMany({
      where: { estabelecimentoId, ativo: true, ...(tipo ? { tipo } : {}) },
      include: {
        modelos: { include: { modelo: { include: { fabricante: true } } } },
        historico: {
          orderBy: { versao: "desc" },
          take: 8,
          select: { versao: true, createdAt: true, createdByNome: true },
        },
      },
      orderBy: { nome: "asc" },
    });
  }

  async byId(estabelecimentoId: string, id: string) {
    const proc = await this.prisma.procedimentoLaudo.findFirst({
      where: { id, estabelecimentoId },
      include: {
        modelos: { include: { modelo: { include: { fabricante: true } } } },
        historico: { orderBy: { versao: "desc" } },
      },
    });
    if (!proc) throw new NotFoundException("Procedimento não encontrado");
    return proc;
  }

  async create(
    user: AuthUser,
    data: {
      nome: string;
      tipo: TipoLaudo;
      validadeMeses?: number;
      itens?: unknown[];
      criterioReferencia?: string;
      criterioVersao?: string;
    },
  ) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "laudos")) throw new ForbiddenException();
    const autor = await this.autorNome(user);
    const created = await this.prisma.procedimentoLaudo.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        nome: data.nome.trim(),
        tipo: data.tipo,
        validadeMeses: data.validadeMeses ?? 12,
        itens: (data.itens ?? []) as object,
        versao: 1,
        criterioReferencia: data.criterioReferencia?.trim() || null,
        criterioVersao: data.criterioVersao?.trim() || null,
        criterioAutorNome: data.criterioReferencia || data.criterioVersao ? autor : null,
        criterioAtualizadoEm: data.criterioReferencia || data.criterioVersao ? new Date() : null,
      },
    });
    await this.gravarVersao(created, user, autor);
    return created;
  }

  async updateItens(user: AuthUser, id: string, itens: unknown[]) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "laudos")) throw new ForbiddenException();
    const proc = await this.findOwned(user.estabelecimentoId, id);
    const autor = await this.autorNome(user);
    const updated = await this.prisma.procedimentoLaudo.update({
      where: { id: proc.id },
      data: { itens: itens as object, versao: proc.versao + 1 },
    });
    await this.gravarVersao(updated, user, autor);
    return updated;
  }

  async updateCriterio(
    user: AuthUser,
    id: string,
    data: { criterioReferencia?: string; criterioVersao?: string; itens?: unknown[] },
  ) {
    if (!temPermissao(user.permissoesModulos, "laudos", PERMISSAO_NIVEL.EDICAO_APROVACAO)) {
      throw new ForbiddenException("Só pessoa autorizada define critério de aceitação (referência e versão)");
    }
    const proc = await this.findOwned(user.estabelecimentoId, id);
    const autor = await this.autorNome(user);
    const bump = data.itens != null;
    const updated = await this.prisma.procedimentoLaudo.update({
      where: { id: proc.id },
      data: {
        ...(bump ? { itens: data.itens as object, versao: proc.versao + 1 } : {}),
        criterioReferencia: data.criterioReferencia?.trim() || proc.criterioReferencia,
        criterioVersao: data.criterioVersao?.trim() || proc.criterioVersao,
        criterioAutorNome: autor,
        criterioAtualizadoEm: new Date(),
      },
    });
    if (bump) await this.gravarVersao(updated, user, autor);
    return updated;
  }

  async vincularModelo(user: AuthUser, id: string, modeloId: string) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "laudos")) throw new ForbiddenException();
    const proc = await this.findOwned(user.estabelecimentoId, id);
    const outros = await this.prisma.procedimentoModelo.findMany({
      where: {
        modeloId,
        procedimento: {
          estabelecimentoId: user.estabelecimentoId,
          tipo: proc.tipo,
          NOT: { id: proc.id },
        },
      },
    });
    await this.prisma.$transaction([
      ...outros.map((o) => this.prisma.procedimentoModelo.delete({ where: { id: o.id } })),
      this.prisma.procedimentoModelo.upsert({
        where: { procedimentoId_modeloId: { procedimentoId: proc.id, modeloId } },
        create: { procedimentoId: proc.id, modeloId },
        update: {},
      }),
    ]);
    return this.prisma.procedimentoLaudo.findUnique({
      where: { id: proc.id },
      include: { modelos: { include: { modelo: true } } },
    });
  }

  private async gravarVersao(
    proc: {
      id: string;
      estabelecimentoId: string;
      versao: number;
      nome: string;
      tipo: TipoLaudo;
      validadeMeses: number;
      itens: unknown;
      criterioReferencia?: string | null;
      criterioVersao?: string | null;
    },
    user: AuthUser,
    autorNome: string,
  ) {
    await this.prisma.procedimentoLaudoVersao.upsert({
      where: { procedimentoId_versao: { procedimentoId: proc.id, versao: proc.versao } },
      create: {
        estabelecimentoId: proc.estabelecimentoId,
        procedimentoId: proc.id,
        versao: proc.versao,
        nome: proc.nome,
        tipo: proc.tipo,
        validadeMeses: proc.validadeMeses,
        itens: proc.itens as object,
        criterioReferencia: proc.criterioReferencia ?? null,
        criterioVersao: proc.criterioVersao ?? null,
        createdById: user.userId,
        createdByNome: autorNome,
      },
      update: {},
    });
  }

  private async autorNome(user: AuthUser) {
    const u = await this.prisma.usuario.findUnique({ where: { id: user.userId }, select: { nome: true } });
    return u?.nome || user.email;
  }

  private async findOwned(estabelecimentoId: string, id: string) {
    const proc = await this.prisma.procedimentoLaudo.findFirst({ where: { id, estabelecimentoId } });
    if (!proc) throw new NotFoundException("Procedimento não encontrado");
    return proc;
  }
}
