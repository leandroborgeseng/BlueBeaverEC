import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { normalizarPermissoesEspeciais, permissoesDoPerfil, type PerfilAcesso } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthTokenPayload } from "./auth.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret && process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET é obrigatório em produção");
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret || "dev-secret-change-me",
    });
  }

  async validate(payload: AuthTokenPayload) {
    // Verificar se o usuário ainda está ativo (rejeita tokens de contas desativadas)
    const user = await this.prisma.usuario.findUnique({
      where: { id: payload.sub },
      select: { ativo: true },
    });

    if (!user || !user.ativo) {
      throw new UnauthorizedException("Usuário inativo ou não encontrado");
    }

    const perfil = payload.perfil as PerfilAcesso;
    const custom = await this.prisma.perfilCustom.findFirst({
      where: {
        estabelecimentoId: payload.estabelecimentoId,
        ativo: true,
        OR: [{ nome: perfil }, { nome: { equals: perfil, mode: "insensitive" } }],
      },
    });
    const permissoesModulos = permissoesDoPerfil(
      perfil,
      custom?.permissoes as Record<string, unknown> | null,
    );

    // E2/Q1: permissões especiais vêm do vínculo; personificação não herda (publicar é ato pessoal)
    const vinculo = payload.impersonatorId
      ? null
      : await this.prisma.usuarioEstabelecimento.findUnique({
          where: { usuarioId_estabelecimentoId: { usuarioId: payload.sub, estabelecimentoId: payload.estabelecimentoId } },
          select: { permissoesEspeciais: true },
        });
    const permissoesEspeciais = normalizarPermissoesEspeciais(vinculo?.permissoesEspeciais);

    return {
      userId: payload.sub,
      email: payload.email,
      estabelecimentoId: payload.estabelecimentoId,
      perfil,
      permissoesModulos,
      permissoesEspeciais,
      impersonatorId: payload.impersonatorId,
      impersonatorNome: payload.impersonatorNome,
      impersonatorPerfil: payload.impersonatorPerfil,
    };
  }
}
