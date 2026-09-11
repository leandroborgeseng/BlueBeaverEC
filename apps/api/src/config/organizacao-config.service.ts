import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
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

  async listUsuarios(estabelecimentoId: string) {
    const vinculos = await this.prisma.usuarioEstabelecimento.findMany({
      where: { estabelecimentoId },
      include: { usuario: { select: { id: true, email: true, nome: true, ativo: true } } },
    });
    const ids = [...new Set(vinculos.flatMap((v) => v.setorIds))];
    const setores = ids.length
      ? await this.prisma.setor.findMany({
          where: { estabelecimentoId, id: { in: ids } },
          select: { id: true, nome: true },
        })
      : [];
    const byId = new Map(setores.map((s) => [s.id, s]));
    return vinculos.map((v) => ({
      ...v,
      setores: v.setorIds.map((id) => byId.get(id)).filter((s): s is { id: string; nome: string } => Boolean(s)),
    }));
  }

  private async resolveSetorIds(estabelecimentoId: string, setorIds: string[]) {
    const unique = [...new Set(setorIds.map((id) => id.trim()).filter(Boolean))];
    if (!unique.length) return [];
    const found = await this.prisma.setor.findMany({
      where: { estabelecimentoId, id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException("Um ou mais setores não pertencem a este estabelecimento");
    }
    return unique;
  }

  async createUsuario(
    user: AuthUser,
    body: { email: string; nome: string; senha: string; perfil: PerfilAcesso; setorIds?: string[] },
  ) {
    this.assertAdmin(user);
    const setorIds = body.setorIds != null ? await this.resolveSetorIds(user.estabelecimentoId, body.setorIds) : [];
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
        setorIds,
      },
      update: { perfil: body.perfil, setorIds },
    });

    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.userId,
        acao: "CRIACAO_USUARIO",
        detalhe: `${body.email} · ${body.perfil} · setores=${setorIds.length}`,
      },
    });

    return this.listUsuarios(user.estabelecimentoId).then((u) =>
      u.find((x) => x.usuario.email === body.email),
    );
  }

  async patchUsuario(
    user: AuthUser,
    id: string,
    body: Partial<{
      nome: string;
      email: string;
      senha: string;
      ativo: boolean;
      perfil: PerfilAcesso;
      setorIds: string[];
    }>,
  ) {
    this.assertAdmin(user);

    const vinculo = await this.prisma.usuarioEstabelecimento.findUnique({
      where: {
        usuarioId_estabelecimentoId: {
          usuarioId: id,
          estabelecimentoId: user.estabelecimentoId,
        },
      },
      include: { usuario: true },
    });
    if (!vinculo) throw new NotFoundException("Usuário não vinculado a este estabelecimento");

    if (body.ativo === false && id === user.userId) {
      throw new ForbiddenException("Não é possível desativar o próprio usuário");
    }

    const dataUsuario: { nome?: string; email?: string; senhaHash?: string; ativo?: boolean } = {};
    if (body.nome != null) dataUsuario.nome = body.nome.trim();
    if (body.ativo != null) dataUsuario.ativo = body.ativo;
    if (body.email != null) {
      const email = body.email.trim().toLowerCase();
      if (email !== vinculo.usuario.email) {
        const clash = await this.prisma.usuario.findUnique({ where: { email } });
        if (clash && clash.id !== id) {
          throw new ForbiddenException("E-mail já em uso por outro usuário");
        }
        dataUsuario.email = email;
      }
    }
    if (body.senha != null && body.senha.trim().length > 0) {
      dataUsuario.senhaHash = await bcrypt.hash(body.senha.trim(), 10);
    }

    if (Object.keys(dataUsuario).length > 0) {
      await this.prisma.usuario.update({
        where: { id },
        data: dataUsuario,
      });
    }

    const vinculoData: { perfil?: PerfilAcesso; setorIds?: string[] } = {};
    if (body.perfil != null) vinculoData.perfil = body.perfil;
    if (body.setorIds != null) {
      vinculoData.setorIds = await this.resolveSetorIds(user.estabelecimentoId, body.setorIds);
    }

    if (Object.keys(vinculoData).length > 0) {
      await this.prisma.usuarioEstabelecimento.update({
        where: {
          usuarioId_estabelecimentoId: {
            usuarioId: id,
            estabelecimentoId: user.estabelecimentoId,
          },
        },
        data: vinculoData,
      });
    }

    const detalhes: string[] = [];
    if (body.nome != null) detalhes.push("nome");
    if (body.email != null) detalhes.push("email");
    if (body.senha) detalhes.push("senha");
    if (body.ativo != null) detalhes.push(`ativo=${body.ativo}`);
    if (body.perfil != null) detalhes.push(`perfil=${body.perfil}`);
    if (body.setorIds != null) detalhes.push(`setores=${vinculoData.setorIds?.length ?? 0}`);

    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.userId,
        acao: "EDICAO_USUARIO",
        detalhe: `${vinculo.usuario.email} · ${detalhes.join(", ") || "sem alterações"}`,
      },
    });

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
