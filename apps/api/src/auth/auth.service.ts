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
