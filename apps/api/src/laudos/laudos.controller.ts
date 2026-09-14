import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { ResultadoLaudo, TipoLaudo } from "@prisma/client";
import type { Response } from "express";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { LaudosService } from "./laudos.service";

class CreateLaudoDto {
  @IsEnum(TipoLaudo)
  tipo!: TipoLaudo;

  @IsString()
  equipamentoTag!: string;

  @IsOptional()
  @IsString()
  procedimentoId?: string;

  @IsOptional()
  @IsString()
  instrumentoId?: string;

  @IsOptional()
  @IsString()
  responsavelTecnicoId?: string;

  @IsOptional()
  @IsString()
  tecnicoNome?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  osNumero?: number;

  @IsOptional()
  @IsArray()
  respostas?: unknown[];

  @IsOptional()
  @IsObject()
  metadados?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(ResultadoLaudo)
  resultado?: ResultadoLaudo;

  @IsOptional()
  @IsString()
  @MinLength(3)
  justificativaRessalva?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  validadeMeses?: number;
}

class PromoverAssinaturaDto {
  @IsEnum(ResultadoLaudo)
  resultado!: ResultadoLaudo;

  @IsOptional()
  @IsString()
  @MinLength(3)
  justificativaRessalva?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  validadeMeses?: number;
}

class PatchLaudoDto {
  @IsOptional()
  @IsArray()
  respostas?: unknown[];

  @IsOptional()
  @IsObject()
  metadados?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  instrumentoId?: string;

  @IsOptional()
  @IsString()
  tecnicoNome?: string;

  @IsOptional()
  @IsString()
  responsavelTecnicoId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  osNumero?: number;

  @IsOptional()
  @IsString()
  justificativaRessalva?: string;
}

class RetificarDto {
  @IsString()
  @MinLength(3)
  justificativa!: string;

  @IsOptional()
  @IsArray()
  respostas?: unknown[];

  @IsOptional()
  @IsEnum(ResultadoLaudo)
  resultado?: ResultadoLaudo;

  @IsOptional()
  @IsString()
  justificativaRessalva?: string;
}

class VisivelPortalDto {
  @IsBoolean()
  visivel!: boolean;
}

@Controller("laudos")
@UseGuards(JwtAuthGuard)
@RequirePermission("laudos", PERMISSAO_NIVEL.LEITURA)
export class LaudosController {
  constructor(private readonly laudos: LaudosService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("tipo") tipo?: TipoLaudo,
    @Query("equipamentoTag") equipamentoTag?: string,
    @Query("resultado") resultado?: ResultadoLaudo,
  ) {
    return this.laudos.list(user.estabelecimentoId, tipo, equipamentoTag, resultado);
  }

  @Get(":id/previa")
  previa(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.laudos.payloadRelatorio(user.estabelecimentoId, id);
  }

  @Get(":id/relatorio.pdf")
  async relatorioPdf(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res() res: Response) {
    const { pdf, nome } = await this.laudos.relatorioPdf(user.estabelecimentoId, id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${nome.replace(/"/g, "")}"`);
    res.send(pdf);
  }

  @Get(":id")
  byId(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.laudos.byId(user.estabelecimentoId, id);
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateLaudoDto) {
    return this.laudos.create(user, {
      ...body,
      respostas: body.respostas as never,
    });
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Patch(":id")
  patch(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: PatchLaudoDto) {
    return this.laudos.atualizarRascunho(user, id, {
      ...body,
      respostas: body.respostas as never,
    });
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO_APROVACAO)
  @Post(":id/finalizar")
  finalizar(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.laudos.finalizar(user, id);
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO_APROVACAO)
  @Post(":id/retificar")
  retificar(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: RetificarDto) {
    return this.laudos.retificar(user, id, {
      ...body,
      respostas: body.respostas as never,
    });
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO_APROVACAO)
  @Post(":id/visivel-portal")
  visivel(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: VisivelPortalDto) {
    return this.laudos.setVisivelPortal(user, id, body.visivel);
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO_APROVACAO)
  @Post(":id/promover-assinatura")
  promover(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: PromoverAssinaturaDto,
  ) {
    return this.laudos.promoverAssinatura(user, id, body);
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Post("preventiva/:id/gerar-os-corretiva")
  gerarPreventiva(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.laudos.gerarOsCorretiva(user, id);
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Post(":id/gerar-os-corretiva")
  gerar(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.laudos.gerarOsCorretiva(user, id);
  }
}
