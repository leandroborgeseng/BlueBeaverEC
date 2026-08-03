import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import type { Response } from "express";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { InstrumentosService } from "./instrumentos.service";

class PontoDto {
  @IsOptional()
  @IsNumber()
  ordem?: number;

  @IsOptional()
  @IsString()
  grandeza?: string;

  @IsString()
  @MinLength(1)
  unidade!: string;

  @IsOptional()
  @IsNumber()
  valorNominal?: number;

  @IsOptional()
  @IsNumber()
  valorConvencional?: number;

  @IsOptional()
  @IsNumber()
  indicacao?: number;

  @IsOptional()
  @IsNumber()
  correcao?: number;

  @IsNumber()
  incertezaExpandida!: number;

  @IsOptional()
  @IsNumber()
  fatorK?: number;

  @IsOptional()
  @IsString()
  observacao?: string;
}

class CreateInstrumentoDto {
  @IsString()
  @MinLength(2)
  nome!: string;

  @IsString()
  @MinLength(1)
  nSerie!: string;

  @IsOptional()
  @IsString()
  fabricante?: string;

  @IsOptional()
  @IsString()
  modelo?: string;

  @IsOptional()
  @IsString()
  codigoPatrimonio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  grandezas?: string[];

  @IsOptional()
  @IsString()
  faixaMedicao?: string;

  @IsOptional()
  @IsString()
  resolucao?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsString()
  certificadoNumero?: string;

  @IsOptional()
  @IsString()
  certificadoEmissao?: string;

  @IsOptional()
  @IsString()
  certificadoValidade?: string;

  @IsOptional()
  @IsString()
  laboratorioEmissor?: string;
}

class UpdateInstrumentoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nome?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  nSerie?: string;

  @IsOptional()
  @IsString()
  fabricante?: string;

  @IsOptional()
  @IsString()
  modelo?: string;

  @IsOptional()
  @IsString()
  codigoPatrimonio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  grandezas?: string[];

  @IsOptional()
  @IsString()
  faixaMedicao?: string;

  @IsOptional()
  @IsString()
  resolucao?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

class CreateCertificadoDto {
  @IsString()
  @MinLength(1)
  numero!: string;

  @IsString()
  dataEmissao!: string;

  @IsString()
  dataValidade!: string;

  @IsOptional()
  @IsString()
  laboratorioEmissor?: string;

  @IsOptional()
  @IsString()
  laboratorioAcreditacao?: string;

  @IsOptional()
  @IsNumber()
  fatorAbrangencia?: number;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsOptional()
  @IsBoolean()
  vigente?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PontoDto)
  pontos?: PontoDto[];

  @IsOptional()
  @IsString()
  anexoDataUrl?: string;

  @IsOptional()
  @IsString()
  anexoNome?: string;
}

@Controller("instrumentos-padroes")
@UseGuards(JwtAuthGuard)
@RequirePermission("laudos", PERMISSAO_NIVEL.LEITURA)
export class InstrumentosController {
  constructor(private readonly instrumentos: InstrumentosService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.instrumentos.list(user.estabelecimentoId, q);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.instrumentos.get(user.estabelecimentoId, id);
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateInstrumentoDto) {
    return this.instrumentos.create(user, body);
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: UpdateInstrumentoDto,
  ) {
    return this.instrumentos.update(user, id, body);
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Post(":id/certificados")
  addCertificado(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: CreateCertificadoDto,
  ) {
    return this.instrumentos.addCertificado(user, id, body);
  }

  @Get(":id/certificados/:certId/pdf")
  async pdf(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("certId") certId: string,
    @Res() res: Response,
  ) {
    const file = await this.instrumentos.certificadoPdf(user.estabelecimentoId, id, certId);
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${file.nomeArquivo.replace(/"/g, "")}"`,
    );
    res.send(Buffer.from(file.conteudo));
  }
}
