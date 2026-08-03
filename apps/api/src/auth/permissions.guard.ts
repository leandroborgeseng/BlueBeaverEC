import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  PERMISSAO_NIVEL,
  permissoesDoPerfil,
  temPermissao,
  type ModuloPermissao,
  type NivelPermissao,
  type PerfilAcesso,
} from "@nexo/shared";
import type { AuthUser } from "./current-user.decorator";

export const PERMISSAO_KEY = "nexo_permissao";

export const RequirePermission = (modulo: ModuloPermissao, minimo: NivelPermissao = PERMISSAO_NIVEL.LEITURA) =>
  SetMetadata(PERMISSAO_KEY, { modulo, minimo });

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const meta = this.reflector.getAllAndOverride<{ modulo: ModuloPermissao; minimo: NivelPermissao }>(
      PERMISSAO_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) return true;

    const req = context.switchToHttp().getRequest<{ user?: AuthUser & { permissoesModulos?: Record<string, number> } }>();
    const user = req.user;
    if (!user) throw new ForbiddenException("Não autenticado");

    const mapa =
      user.permissoesModulos ??
      permissoesDoPerfil(user.perfil as PerfilAcesso);

    if (!temPermissao(mapa, meta.modulo, meta.minimo)) {
      throw new ForbiddenException(`Sem permissão para ${meta.modulo}`);
    }
    return true;
  }
}
