import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { permissoesDoPerfil, type PerfilAcesso } from "@aion/shared";
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

    return {
      userId: payload.sub,
      email: payload.email,
      estabelecimentoId: payload.estabelecimentoId,
      perfil,
      permissoesModulos,
    };
  }
}
