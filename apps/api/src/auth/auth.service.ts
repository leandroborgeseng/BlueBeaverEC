import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import type { PerfilAcesso } from "@aion/shared";
import type { AuthUser } from "./current-user.decorator";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  estabelecimentoId: string;
  perfil: PerfilAcesso;
  impersonatorId?: string;
  impersonatorNome?: string;
  impersonatorPerfil?: PerfilAcesso;
}

const PERFIS_PERSONIFICAM: PerfilAcesso[] = ["ADMIN", "GESTOR", "ENGENHEIRO"];

export function podePersonificar(perfil?: string | null) {
  return PERFIS_PERSONIFICAM.includes((perfil ?? "") as PerfilAcesso);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, senha: string, estabelecimentoId?: string) {
    const normalized = email.toLowerCase().trim();
    const legacy =
      normalized.endsWith("@aion.local")
        ? normalized.replace(/@aion\.local$/, "@nexo.local")
        : normalized.endsWith("@nexo.local")
          ? normalized.replace(/@nexo\.local$/, "@aion.local")
          : null;

    let usuario = await this.prisma.usuario.findUnique({
      where: { email: normalized },
      include: { estabelecimentos: { include: { estabelecimento: true } } },
    });

    // Compat: banco ainda com @nexo.local ou usuário digitou o domínio antigo
    if (!usuario && legacy) {
      usuario = await this.prisma.usuario.findUnique({
        where: { email: legacy },
        include: { estabelecimentos: { include: { estabelecimento: true } } },
      });
    }

    if (!usuario || !usuario.ativo) {
      throw new UnauthorizedException("Credenciais inválidas");
    }

    const ok = await bcrypt.compare(senha, usuario.senhaHash);
    // Compat senha demo antiga (nexo1234) → aceita e atualiza para aion1234
    let senhaOk = ok;
    if (!senhaOk && senha === "aion1234") {
      const legacyPass = await bcrypt.compare("nexo1234", usuario.senhaHash);
      if (legacyPass) {
        senhaOk = true;
        const senhaHash = await bcrypt.hash("aion1234", 10);
        const emailFinal = usuario.email.includes("@nexo.local")
          ? usuario.email.replace(/@nexo\.local$/, "@aion.local")
          : usuario.email;
        await this.prisma.usuario.update({
          where: { id: usuario.id },
          data: { senhaHash, email: emailFinal },
        });
        usuario = { ...usuario, email: emailFinal, senhaHash };
      }
    }
    if (!senhaOk) {
      throw new UnauthorizedException("Credenciais inválidas");
    }

    const vinculos = usuario.estabelecimentos;
    if (vinculos.length === 0) {
      throw new UnauthorizedException("Usuário sem estabelecimento");
    }

    const vinculo =
      (estabelecimentoId
        ? vinculos.find((v) => v.estabelecimentoId === estabelecimentoId)
        : undefined) ?? vinculos[0];

    await this.prisma.logAcesso.create({
      data: {
        usuarioId: usuario.id,
        acao: "LOGIN",
        detalhe: vinculo.estabelecimento.nome,
      },
    });

    const payload: AuthTokenPayload = {
      sub: usuario.id,
      email: usuario.email,
      estabelecimentoId: vinculo.estabelecimentoId,
      perfil: vinculo.perfil as PerfilAcesso,
    };

    return {
      accessToken: await this.sign(payload),
      user: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: vinculo.perfil,
        estabelecimentoId: vinculo.estabelecimentoId,
        estabelecimentoNome: vinculo.estabelecimento.nome,
        setorIds: vinculo.setorIds,
        estabelecimentos: vinculos.map((v) => ({
          id: v.estabelecimentoId,
          nome: v.estabelecimento.nome,
          perfil: v.perfil,
        })),
      },
    };
  }

  async switchEstabelecimento(user: AuthUser, estabelecimentoId: string) {
    const usuarioId = user.userId;
    const vinculo = await this.prisma.usuarioEstabelecimento.findUnique({
      where: {
        usuarioId_estabelecimentoId: { usuarioId, estabelecimentoId },
      },
      include: { estabelecimento: true, usuario: true },
    });

    if (!vinculo) {
      throw new UnauthorizedException("Sem acesso a este estabelecimento");
    }

    await this.prisma.logAcesso.create({
      data: {
        usuarioId,
        acao: "TROCA_ESTABELECIMENTO",
        detalhe: vinculo.estabelecimento.nome,
      },
    });

    const payload: AuthTokenPayload = {
      sub: usuarioId,
      email: vinculo.usuario.email,
      estabelecimentoId,
      perfil: vinculo.perfil as PerfilAcesso,
      ...(user.impersonatorId
        ? {
            impersonatorId: user.impersonatorId,
            impersonatorNome: user.impersonatorNome,
            impersonatorPerfil: user.impersonatorPerfil,
          }
        : {}),
    };

    return {
      accessToken: await this.sign(payload),
      estabelecimento: {
        id: vinculo.estabelecimentoId,
        nome: vinculo.estabelecimento.nome,
        perfil: vinculo.perfil,
      },
    };
  }

  async listarAlvosPersonificacao(user: AuthUser) {
    this.assertPodePersonificar(user);
    const vinculos = await this.prisma.usuarioEstabelecimento.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        usuario: { ativo: true, id: { not: user.userId } },
      },
      include: { usuario: { select: { id: true, nome: true, email: true } } },
    });
    return vinculos
      .map((v) => ({
        id: v.usuario.id,
        nome: v.usuario.nome,
        email: v.usuario.email,
        perfil: v.perfil,
      }))
      .sort((a, b) => a.perfil.localeCompare(b.perfil) || a.nome.localeCompare(b.nome, "pt-BR"));
  }

  async personificar(user: AuthUser, alvoId: string) {
    this.assertPodePersonificar(user);
    if (alvoId === user.userId) {
      throw new ForbiddenException("Você já está neste perfil");
    }

    const vinculo = await this.prisma.usuarioEstabelecimento.findUnique({
      where: {
        usuarioId_estabelecimentoId: {
          usuarioId: alvoId,
          estabelecimentoId: user.estabelecimentoId,
        },
      },
      include: { usuario: true, estabelecimento: true },
    });
    if (!vinculo || !vinculo.usuario.ativo) {
      throw new NotFoundException("Usuário não encontrado neste estabelecimento");
    }

    const ator = await this.prisma.usuario.findUnique({ where: { id: user.userId } });
    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.userId,
        acao: "PERSONIFICAR",
        detalhe: `${vinculo.usuario.email} · ${vinculo.perfil}`,
      },
    });

    const payload: AuthTokenPayload = {
      sub: vinculo.usuario.id,
      email: vinculo.usuario.email,
      estabelecimentoId: vinculo.estabelecimentoId,
      perfil: vinculo.perfil as PerfilAcesso,
      impersonatorId: user.userId,
      impersonatorNome: ator?.nome ?? user.email,
      impersonatorPerfil: user.perfil,
    };

    return {
      accessToken: await this.sign(payload),
      user: {
        id: vinculo.usuario.id,
        nome: vinculo.usuario.nome,
        email: vinculo.usuario.email,
        perfil: vinculo.perfil,
        estabelecimentoId: vinculo.estabelecimentoId,
        estabelecimentoNome: vinculo.estabelecimento.nome,
      },
    };
  }

  async encerrarPersonificacao(user: AuthUser) {
    if (!user.impersonatorId) {
      throw new ForbiddenException("Nenhuma personificação ativa");
    }

    const atorVinculo = await this.prisma.usuarioEstabelecimento.findUnique({
      where: {
        usuarioId_estabelecimentoId: {
          usuarioId: user.impersonatorId,
          estabelecimentoId: user.estabelecimentoId,
        },
      },
      include: { usuario: true, estabelecimento: true },
    });
    if (!atorVinculo || !atorVinculo.usuario.ativo) {
      throw new UnauthorizedException("Não foi possível restaurar o perfil original");
    }
    if (!podePersonificar(atorVinculo.perfil)) {
      throw new ForbiddenException("Perfil original sem permissão para personificar");
    }

    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.impersonatorId,
        acao: "ENCERRAR_PERSONIFICACAO",
        detalhe: `${user.email} · ${user.perfil}`,
      },
    });

    const payload: AuthTokenPayload = {
      sub: atorVinculo.usuario.id,
      email: atorVinculo.usuario.email,
      estabelecimentoId: atorVinculo.estabelecimentoId,
      perfil: atorVinculo.perfil as PerfilAcesso,
    };

    return {
      accessToken: await this.sign(payload),
      user: {
        id: atorVinculo.usuario.id,
        nome: atorVinculo.usuario.nome,
        email: atorVinculo.usuario.email,
        perfil: atorVinculo.perfil,
        estabelecimentoId: atorVinculo.estabelecimentoId,
        estabelecimentoNome: atorVinculo.estabelecimento.nome,
      },
    };
  }

  async logout(usuarioId: string) {
    await this.prisma.logAcesso.create({
      data: {
        usuarioId,
        acao: "LOGOUT",
      },
    });
    return { ok: true };
  }

  private assertPodePersonificar(user: AuthUser) {
    if (user.impersonatorId) {
      throw new ForbiddenException("Encerre a personificação atual antes de trocar de perfil");
    }
    if (!podePersonificar(user.perfil)) {
      throw new ForbiddenException("Sem permissão para personificar usuários");
    }
  }

  private sign(payload: AuthTokenPayload) {
    return this.jwt.signAsync(payload);
  }
}
