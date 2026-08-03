import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PerfilAcesso } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PERMISSAO_NIVEL, temPermissao } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class OrganizacaoConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private assertAdmin(user: AuthUser) {
    const ok =
      temPermissao(user.permissoesModulos, "config", PERMISSAO_NIVEL.EDICAO) ||
      user.perfil === PerfilAcesso.ADMIN ||
      user.perfil === PerfilAcesso.GESTOR;
    if (!ok) throw new ForbiddenException("Sem permissão de configuração");
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

    if (existing) {
      await this.prisma.usuario.update({
        where: { id: existing.id },
        data: { nome: body.nome, senhaHash },
      });
    }

    await this.prisma.usuarioEstabelecimento.upsert({
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
    });

    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.userId,
        acao: "CRIACAO_USUARIO",
        detalhe: `${body.email} · ${body.perfil}`,
      },
    });

    return this.listUsuarios(user.estabelecimentoId).then((u) =>
      u.find((x) => x.usuario.email === body.email),
    );
  }

  async patchUsuario(
    user: AuthUser,
    id: string,
    body: Partial<{ nome: string; ativo: boolean; perfil: PerfilAcesso }>,
  ) {
    this.assertAdmin(user);
    if (body.nome != null || body.ativo != null) {
      await this.prisma.usuario.update({
        where: { id },
        data: {
          ...(body.nome != null ? { nome: body.nome } : {}),
          ...(body.ativo != null ? { ativo: body.ativo } : {}),
        },
      });
    }
    if (body.perfil != null) {
      await this.prisma.usuarioEstabelecimento.update({
        where: {
          usuarioId_estabelecimentoId: {
            usuarioId: id,
            estabelecimentoId: user.estabelecimentoId,
          },
        },
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

  createPerfil(user: AuthUser, body: { nome: string; permissoes: Record<string, string | number> }) {
    this.assertAdmin(user);
    return this.prisma.perfilCustom.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        nome: body.nome.trim(),
        permissoes: body.permissoes,
      },
    });
  }

  async patchPerfil(
    user: AuthUser,
    id: string,
    body: Partial<{ nome: string; permissoes: Record<string, string | number>; ativo: boolean }>,
  ) {
    this.assertAdmin(user);
    const row = await this.prisma.perfilCustom.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!row) throw new NotFoundException();
    return this.prisma.perfilCustom.update({
      where: { id },
      data: {
        ...(body.nome != null ? { nome: body.nome.trim() } : {}),
        ...(body.permissoes != null ? { permissoes: body.permissoes } : {}),
        ...(body.ativo != null ? { ativo: body.ativo } : {}),
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
