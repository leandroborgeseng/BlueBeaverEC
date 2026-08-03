import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { isObservable, lastValueFrom } from "rxjs";
import {
  PERMISSAO_NIVEL,
  permissoesDoPerfil,
  temPermissao,
  type ModuloPermissao,
  type NivelPermissao,
  type PerfilAcesso,
} from "@aion/shared";
import type { AuthUser } from "./current-user.decorator";

export const PERMISSAO_KEY = "aion_permissao";
export const IS_PUBLIC_KEY = "aion_public";

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const RequirePermission = (modulo: ModuloPermissao, minimo: NivelPermissao = PERMISSAO_NIVEL.LEITURA) =>
  SetMetadata(PERMISSAO_KEY, { modulo, minimo });

/**
 * Guard global fail-closed:
 * - `@Public()` → libera sem JWT
 * - `@RequirePermission` → JWT + módulo
 * - sem meta → exige JWT (controllers com só JwtAuthGuard continuam ok)
 */
@Injectable()
export class PermissionsGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const meta = this.reflector.getAllAndOverride<{ modulo: ModuloPermissao; minimo: NivelPermissao }>(
      PERMISSAO_KEY,
      [context.getHandler(), context.getClass()],
    );

    const jwtResult = await super.canActivate(context);
    const jwtOk = isObservable(jwtResult)
      ? await lastValueFrom(jwtResult)
      : await Promise.resolve(jwtResult);
    if (!jwtOk) return false;

    if (!meta) return true;

    const req = context.switchToHttp().getRequest<{
      user?: AuthUser & { permissoesModulos?: Record<string, number> };
    }>();
    const user = req.user;
    if (!user) throw new UnauthorizedException("Não autenticado");

    const mapa = user.permissoesModulos ?? permissoesDoPerfil(user.perfil as PerfilAcesso);

    if (!temPermissao(mapa, meta.modulo, meta.minimo)) {
      throw new ForbiddenException(`Sem permissão para ${meta.modulo}`);
    }
    return true;
  }
}
