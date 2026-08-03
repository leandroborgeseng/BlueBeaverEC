import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { MapaPermissoes, PerfilAcesso } from "@nexo/shared";

export interface AuthUser {
  userId: string;
  email: string;
  estabelecimentoId: string;
  perfil: PerfilAcesso;
  permissoesModulos?: MapaPermissoes;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
  return request.user;
});
