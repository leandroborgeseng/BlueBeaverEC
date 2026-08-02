import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { ResultadoLaudo, TipoLaudo } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
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

@Controller("laudos")
@UseGuards(JwtAuthGuard)
export class LaudosController {
  constructor(private readonly laudos: LaudosService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("tipo") tipo?: TipoLaudo,
    @Query("equipamentoTag") equipamentoTag?: string,
  ) {
    return this.laudos.list(user.estabelecimentoId, tipo, equipamentoTag);
  }

  @Get(":id")
  byId(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.laudos.byId(user.estabelecimentoId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateLaudoDto) {
    return this.laudos.create(user, {
      ...body,
      respostas: body.respostas as never,
    });
  }

  @Post("preventiva/:id/gerar-os-corretiva")
  gerarPreventiva(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.laudos.gerarOsCorretiva(user, id);
  }

  @Post(":id/gerar-os-corretiva")
  gerar(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.laudos.gerarOsCorretiva(user, id);
  }
}
