import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PerfilAcesso } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class OrganizacaoConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(user: AuthUser) {
    if (user.perfil !== PerfilAcesso.ADMIN && user.perfil !== PerfilAcesso.ENGENHEIRO && user.perfil !== PerfilAcesso.GESTOR) {
      throw new ForbiddenException("Sem permissão de configuração");
    }
  }

  getOrganizacao(estabelecimentoId: string) {
    return this.prisma.estabelecimento.findUniqueOrThrow({ where: { id: estabelecimentoId } });
  }

  async patchOrganizacao(
    user: AuthUser,
    body: Partial<{ nome: string; cnpj: string; fusoHorario: string; slaUrgenteHoras: number }>,
  ) {
    this.assertAdmin(user);
    return this.prisma.estabelecimento.update({
      where: { id: user.estabelecimentoId },
      data: body,
    });
  }

  listUsuarios(estabelecimentoId: string) {
    return this.prisma.usuarioEstabelecimento.findMany({
      where: { estabelecimentoId },
      include: { usuario: { select: { id: true, email: true, nome: true, ativo: true } } },
    });
  }

  async createUsuario(
    user: AuthUser,
    body: { email: string; nome: string; senha: string; perfil: PerfilAcesso },
  ) {
    this.assertAdmin(user);
    const existing = await this.prisma.usuario.findUnique({ where: { email: body.email } });
    const senhaHash = await bcrypt.hash(body.senha, 10);
    const usuario =
      existing ??
      (await this.prisma.usuario.create({
        data: { email: body.email, nome: body.nome, senhaHash },
      }));
    return this.prisma.usuarioEstabelecimento.upsert({
      where: {
        usuarioId_estabelecimentoId: {
          usuarioId: usuario.id,
          estabelecimentoId: user.estabelecimentoId,
        },
      },
      create: {
        usuarioId: usuario.id,
        estabelecimentoId: user.estabelecimentoId,
        perfil: body.perfil,
      },
      update: { perfil: body.perfil },
      include: { usuario: true },
    });
  }

  async patchUsuario(
    user: AuthUser,
    id: string,
    body: Partial<{ nome: string; ativo: boolean; perfil: PerfilAcesso }>,
  ) {
    this.assertAdmin(user);
    const vinculo = await this.prisma.usuarioEstabelecimento.findFirst({
      where: { estabelecimentoId: user.estabelecimentoId, usuarioId: id },
    });
    if (!vinculo) throw new NotFoundException("Usuário não vinculado");
    if (body.nome != null || body.ativo != null) {
      await this.prisma.usuario.update({
        where: { id },
        data: {
          ...(body.nome != null ? { nome: body.nome } : {}),
          ...(body.ativo != null ? { ativo: body.ativo } : {}),
        },
      });
    }
    if (body.perfil) {
      await this.prisma.usuarioEstabelecimento.update({
        where: { id: vinculo.id },
        data: { perfil: body.perfil },
      });
      await this.prisma.logAcesso.create({
        data: {
          usuarioId: user.userId,
          acao: "EDICAO_PERMISSAO",
          detalhe: `estab ${user.estabelecimentoId} · perfil ${body.perfil} para ${id}`,
        },
      });
    }
    return this.listUsuarios(user.estabelecimentoId).then((u) => u.find((x) => x.usuarioId === id));
  }

  listPerfis(estabelecimentoId: string) {
    return this.prisma.perfilCustom.findMany({
      where: { estabelecimentoId },
      orderBy: { nome: "asc" },
    });
  }

  createPerfil(user: AuthUser, body: { nome: string; permissoes: Record<string, string> }) {
    this.assertAdmin(user);
    return this.prisma.perfilCustom.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        nome: body.nome,
        permissoes: body.permissoes,
      },
    });
  }

  async logsAcesso(estabelecimentoId: string, de?: string, ate?: string) {
    const vinculos = await this.prisma.usuarioEstabelecimento.findMany({
      where: { estabelecimentoId },
      select: { usuarioId: true },
    });
    const ids = vinculos.map((v) => v.usuarioId);
    return this.prisma.logAcesso.findMany({
      where: {
        OR: [{ usuarioId: { in: ids } }, { detalhe: { contains: estabelecimentoId } }],
        ...(de || ate
          ? {
              createdAt: {
                ...(de ? { gte: new Date(de) } : {}),
                ...(ate ? { lte: new Date(ate) } : {}),
              },
            }
          : {}),
      },
      include: { usuario: { select: { nome: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }
}
