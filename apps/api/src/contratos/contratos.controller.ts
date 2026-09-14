import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { IndiceReajuste, PeriodicidadeContrato, SituacaoContrato, TipoContrato } from "@prisma/client";
import { PERMISSAO_NIVEL } from "@aion/shared";
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

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valor?: number;

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

  @IsOptional()
  @IsEnum(TipoContrato)
  tipo?: TipoContrato;

  @IsOptional()
  @IsEnum(PeriodicidadeContrato)
  periodicidade?: PeriodicidadeContrato;

  @IsOptional()
  @IsString()
  escopo?: string;

  @IsOptional()
  @IsString()
  exclusoes?: string;

  @IsOptional()
  @IsBoolean()
  cobrePecas?: boolean;

  @IsOptional()
  @IsBoolean()
  cobreServicos?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  diasAlertaVencimento?: number;

  @IsOptional()
  @IsString()
  observacoes?: string;
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

class UpdateContratoDto {
  @IsOptional()
  @IsString()
  fornecedorId?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  descricao?: string;

  @IsOptional()
  @IsString()
  vigenciaInicio?: string;

  @IsOptional()
  @IsString()
  vigenciaFim?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valor?: number;

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

  @IsOptional()
  @IsEnum(SituacaoContrato)
  situacao?: SituacaoContrato;

  @IsOptional()
  @IsEnum(TipoContrato)
  tipo?: TipoContrato;

  @IsOptional()
  @IsEnum(PeriodicidadeContrato)
  periodicidade?: PeriodicidadeContrato;

  @IsOptional()
  @IsString()
  escopo?: string;

  @IsOptional()
  @IsString()
  exclusoes?: string;

  @IsOptional()
  @IsBoolean()
  cobrePecas?: boolean;

  @IsOptional()
  @IsBoolean()
  cobreServicos?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  diasAlertaVencimento?: number;

  @IsOptional()
  @IsString()
  observacoes?: string;
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

  @Get(":numero")
  get(@CurrentUser() user: AuthUser, @Param("numero") numero: string) {
    return this.contratos.get(user.estabelecimentoId, numero);
  }

  @Post()
  @RequirePermission("contratos", PERMISSAO_NIVEL.EDICAO)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateContratoDto) {
    return this.contratos.create(user, body);
  }

  @Patch(":numero")
  @RequirePermission("contratos", PERMISSAO_NIVEL.EDICAO)
  update(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: UpdateContratoDto,
  ) {
    return this.contratos.update(user, numero, body);
  }

  @Post(":numero/glosas")
  @RequirePermission("contratos", PERMISSAO_NIVEL.EDICAO)
  glosa(@CurrentUser() user: AuthUser, @Param("numero") numero: string, @Body() body: GlosaDto) {
    return this.contratos.addGlosa(user, numero, body);
  }

  @Post(":numero/documentos")
  @RequirePermission("contratos", PERMISSAO_NIVEL.EDICAO)
  documento(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: { dataUrl: string; nomeArquivo?: string; descricao?: string },
  ) {
    return this.contratos.addDocumento(user, numero, body);
  }

  @Get(":numero/documentos/:docId")
  async baixarDoc(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Param("docId") docId: string,
    @Res() res: Response,
  ) {
    const doc = await this.contratos.baixarDocumento(user, numero, docId);
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.nomeArquivo.replace(/"/g, "")}"`);
    res.send(Buffer.from(doc.conteudo));
  }
}
