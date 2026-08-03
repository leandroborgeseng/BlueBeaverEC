import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { FormulaIndicador } from "@prisma/client";
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, MinLength } from "class-validator";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { IndicadoresService } from "./indicadores.service";

class ConstrutorDto {
  @IsString()
  @MinLength(3)
  nome!: string;

  @IsArray()
  @IsString({ each: true })
  campos!: string[];

  @IsEnum(FormulaIndicador)
  formula!: FormulaIndicador;

  @IsOptional()
  @IsString()
  metaTexto?: string;

  @IsOptional()
  @IsNumber()
  metaNum?: number;
}

@Controller("indicadores")
@UseGuards(JwtAuthGuard)
@RequirePermission("estrategico", PERMISSAO_NIVEL.LEITURA)
export class IndicadoresController {
  constructor(private readonly indicadores: IndicadoresService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.indicadores.list(user.estabelecimentoId);
  }

  @Get(":id/historico")
  historico(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query("meses") meses?: string,
  ) {
    return this.indicadores.historico(user.estabelecimentoId, id, meses ? Number(meses) : 6);
  }

  @Post("construtor")
  construtor(@CurrentUser() user: AuthUser, @Body() body: ConstrutorDto) {
    return this.indicadores.construtor(user, body);
  }
}
