import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { TipoLaudo } from "@prisma/client";
import { IsString, MinLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { LaudosService } from "./laudos.service";

class ReabrirDto {
  @IsString()
  @MinLength(3)
  justificativa!: string;
}

@Controller("certificados")
@UseGuards(JwtAuthGuard)
export class CertificadosController {
  constructor(private readonly laudos: LaudosService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("tipo") tipo?: TipoLaudo) {
    return this.laudos.certificados(user.estabelecimentoId, tipo);
  }

  @Get(":id/documento")
  documento(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.laudos.certificadoDocumento(user.estabelecimentoId, id);
  }

  @Post(":id/reabrir")
  reabrir(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: ReabrirDto) {
    return this.laudos.reabrirCertificado(user, id, body.justificativa);
  }
}
