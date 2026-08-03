import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import type { PerfilAcesso } from "@aion/shared";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  estabelecimentoId: string;
  perfil: PerfilAcesso;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, senha: string, estabelecimentoId?: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { estabelecimentos: { include: { estabelecimento: true } } },
    });

    if (!usuario || !usuario.ativo) {
      throw new UnauthorizedException("Credenciais inválidas");
    }

    const ok = await bcrypt.compare(senha, usuario.senhaHash);
    if (!ok) {
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
      accessToken: await this.jwt.signAsync(payload),
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

  async switchEstabelecimento(usuarioId: string, estabelecimentoId: string) {
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
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      estabelecimento: {
        id: vinculo.estabelecimentoId,
        nome: vinculo.estabelecimento.nome,
        perfil: vinculo.perfil,
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
}
