import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { LaudosService } from "./laudos.service";

@Controller("equipamentos")
@UseGuards(JwtAuthGuard)
@RequirePermission("equipamentos", PERMISSAO_NIVEL.LEITURA)
export class FichaVidaController {
  constructor(private readonly laudos: LaudosService) {}

  @Get(":tag/ficha-vida")
  ficha(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    return this.laudos.fichaVida(user.estabelecimentoId, tag);
  }

  @Get(":tag/historico")
  historico(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    return this.laudos.historicoEquipamento(user.estabelecimentoId, tag);
  }

  @Get(":tag/confiabilidade")
  async confiabilidade(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    const ficha = await this.laudos.fichaVida(user.estabelecimentoId, tag);
    return ficha.confiabilidade;
  }

  @Get(":tag/custos")
  async custos(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    const ficha = await this.laudos.fichaVida(user.estabelecimentoId, tag);
    return ficha.custos;
  }
}
