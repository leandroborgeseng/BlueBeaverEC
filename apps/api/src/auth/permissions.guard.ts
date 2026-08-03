import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
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

export const RequirePermission = (modulo: ModuloPermissao, minimo: NivelPermissao = PERMISSAO_NIVEL.LEITURA) =>
  SetMetadata(PERMISSAO_KEY, { modulo, minimo });

/**
 * Guard global: só exige JWT + permissão quando há `@RequirePermission`.
 * Assim o JWT roda aqui (APP_GUARD executa antes do `@UseGuards(JwtAuthGuard)`).
 */
@Injectable()
export class PermissionsGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<{ modulo: ModuloPermissao; minimo: NivelPermissao }>(
      PERMISSAO_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) return true;

    const jwtResult = await super.canActivate(context);
    const jwtOk = isObservable(jwtResult)
      ? await lastValueFrom(jwtResult)
      : await Promise.resolve(jwtResult);
    if (!jwtOk) return false;

    const req = context.switchToHttp().getRequest<{
      user?: AuthUser & { permissoesModulos?: Record<string, number> };
    }>();
    const user = req.user;
    if (!user) throw new ForbiddenException("Não autenticado");

    const mapa = user.permissoesModulos ?? permissoesDoPerfil(user.perfil as PerfilAcesso);

    if (!temPermissao(mapa, meta.modulo, meta.minimo)) {
      throw new ForbiddenException(`Sem permissão para ${meta.modulo}`);
    }
    return true;
  }
}
