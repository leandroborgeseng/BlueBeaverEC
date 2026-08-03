import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsArray, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { TipoLaudo } from "@prisma/client";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { ProcedimentosService } from "./procedimentos.service";

class CreateProcDto {
  @IsString()
  @MinLength(2)
  nome!: string;

  @IsEnum(TipoLaudo)
  tipo!: TipoLaudo;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  validadeMeses?: number;

  @IsOptional()
  @IsArray()
  itens?: unknown[];
}

class ItensDto {
  @IsArray()
  itens!: unknown[];
}

class VincularDto {
  @IsString()
  modeloId!: string;
}

@Controller("procedimentos-laudo")
@UseGuards(JwtAuthGuard)
@RequirePermission("laudos", PERMISSAO_NIVEL.LEITURA)
export class ProcedimentosController {
  constructor(private readonly procedimentos: ProcedimentosService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("tipo") tipo?: TipoLaudo) {
    return this.procedimentos.list(user.estabelecimentoId, tipo);
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateProcDto) {
    return this.procedimentos.create(user, body);
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Patch(":id/itens")
  itens(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: ItensDto) {
    return this.procedimentos.updateItens(user, id, body.itens);
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Post(":id/vincular")
  vincular(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: VincularDto) {
    return this.procedimentos.vincularModelo(user, id, body.modeloId);
  }
}
