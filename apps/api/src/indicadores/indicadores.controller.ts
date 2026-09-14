import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { FormulaIndicador } from "@prisma/client";
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, MinLength } from "class-validator";
import type { Response } from "express";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { IndicadoresService, type FiltrosPainel } from "./indicadores.service";

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

  @Get("painel")
  painel(
    @CurrentUser() user: AuthUser,
    @Query("de") de?: string,
    @Query("ate") ate?: string,
    @Query("setorId") setorId?: string,
    @Query("tipo") tipo?: string,
    @Query("prioridade") prioridade?: string,
  ) {
    const filtros: FiltrosPainel = { de, ate, setorId, tipo, prioridade };
    return this.indicadores.painel(user, filtros);
  }

  @Get("painel/export")
  async exportar(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query("de") de?: string,
    @Query("ate") ate?: string,
    @Query("setorId") setorId?: string,
    @Query("tipo") tipo?: string,
    @Query("prioridade") prioridade?: string,
    @Query("formato") formato?: string,
  ) {
    const painel = await this.indicadores.painel(user, { de, ate, setorId, tipo, prioridade });
    if (formato === "json") return res.json(painel);
    const csv = this.indicadores.exportCsv(painel);
    const nome = `indicadores-gestor-${painel.filtros.de.slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
    res.send(csv);
  }

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
  @RequirePermission("estrategico", PERMISSAO_NIVEL.EDICAO)
  construtor(@CurrentUser() user: AuthUser, @Body() body: ConstrutorDto) {
    return this.indicadores.construtor(user, body);
  }
}
