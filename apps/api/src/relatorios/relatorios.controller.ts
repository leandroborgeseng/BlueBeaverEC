import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { FrequenciaRelatorio } from "@prisma/client";
import { IsArray, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { RelatoriosService } from "./relatorios.service";

class GerarDto {
  @IsString()
  template!: string;

  @IsOptional()
  @IsString()
  formato?: "pdf" | "xlsx" | "json";
}

class AgendamentoDto {
  @IsString()
  @MinLength(2)
  template!: string;

  @IsEnum(FrequenciaRelatorio)
  frequencia!: FrequenciaRelatorio;

  @IsArray()
  @IsString({ each: true })
  destinatarios!: string[];
}

@Controller("relatorios")
@UseGuards(JwtAuthGuard)
export class RelatoriosController {
  constructor(private readonly relatorios: RelatoriosService) {}

  @Get("templates")
  templates() {
    return this.relatorios.templates();
  }

  @Post("gerar")
  gerar(@CurrentUser() user: AuthUser, @Body() body: GerarDto) {
    return this.relatorios.gerar(user.estabelecimentoId, body.template, body.formato ?? "json");
  }

  @Get("agendamentos")
  list(@CurrentUser() user: AuthUser) {
    return this.relatorios.listAgendamentos(user.estabelecimentoId);
  }

  @Post("agendamentos")
  create(@CurrentUser() user: AuthUser, @Body() body: AgendamentoDto) {
    return this.relatorios.createAgendamento(user, body);
  }
}
