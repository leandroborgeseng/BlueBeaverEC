import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { TipoLaudo } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { LaudosService } from "./laudos.service";

@Controller("certificados")
@UseGuards(JwtAuthGuard)
export class CertificadosController {
  constructor(private readonly laudos: LaudosService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("tipo") tipo?: TipoLaudo) {
    return this.laudos.certificados(user.estabelecimentoId, tipo);
  }
}
