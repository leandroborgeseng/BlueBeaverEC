import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { IndiceReajuste, SituacaoContrato } from "@prisma/client";
import { PERMISSAO_NIVEL } from "@nexo/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { ContratosService } from "./contratos.service";

class CreateContratoDto {
  @IsString()
  numero!: string;

  @IsString()
  fornecedorId!: string;

  @IsString()
  @MinLength(3)
  descricao!: string;

  @IsString()
  vigenciaInicio!: string;

  @IsString()
  vigenciaFim!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valor!: number;

  @IsOptional()
  @IsArray()
  equipamentoTags?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  slaAtendimentoHoras?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  slaSolucaoHoras?: number;

  @IsOptional()
  @IsEnum(IndiceReajuste)
  indiceReajuste?: IndiceReajuste;

  @IsOptional()
  @IsString()
  dataReajusteAniversario?: string;
}

class GlosaDto {
  @IsOptional()
  @IsString()
  data?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  valor!: number;

  @IsString()
  @MinLength(3)
  motivo!: string;
}

@Controller("contratos")
@UseGuards(JwtAuthGuard)
@RequirePermission("contratos", PERMISSAO_NIVEL.LEITURA)
export class ContratosController {
  constructor(private readonly contratos: ContratosService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("situacao") situacao?: SituacaoContrato) {
    return this.contratos.list(user.estabelecimentoId, situacao);
  }

  @Get("vencendo")
  vencendo(@CurrentUser() user: AuthUser, @Query("dias") dias?: string) {
    return this.contratos.vencendo(user.estabelecimentoId, dias ?? "90,60,30");
  }

  @Get("alertas")
  alertas(@CurrentUser() user: AuthUser) {
    return this.contratos.alertas(user.estabelecimentoId);
  }

  @Get(":numero/matriz-cobertura")
  matriz(@CurrentUser() user: AuthUser, @Param("numero") numero: string) {
    return this.contratos.matrizCobertura(user.estabelecimentoId, numero);
  }

  @Post()
  @RequirePermission("contratos", PERMISSAO_NIVEL.EDICAO)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateContratoDto) {
    return this.contratos.create(user, body);
  }

  @Post(":numero/glosas")
  @RequirePermission("contratos", PERMISSAO_NIVEL.EDICAO)
  glosa(@CurrentUser() user: AuthUser, @Param("numero") numero: string, @Body() body: GlosaDto) {
    return this.contratos.addGlosa(user, numero, body);
  }
}
