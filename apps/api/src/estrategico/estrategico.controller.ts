import { Body, Controller, Get, Param, Patch, Post, Put, Query, Res, UseGuards } from "@nestjs/common";
import { EtapaJornada } from "@prisma/client";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { EstrategicoService } from "./estrategico.service";

class AvaliacaoDto {
  @IsInt()
  @Min(1)
  @Max(5)
  nivel!: number;

  @IsOptional()
  gaps?: unknown;

  @IsOptional()
  evidencias?: unknown;

  @IsOptional()
  @IsString()
  planoAcao?: string;
}

class JornadaDto {
  @IsEnum(EtapaJornada)
  etapaAtual!: EtapaJornada;

  @IsOptional()
  notas?: object;
}

class EvidenciaDto {
  @IsString()
  requisitoId!: string;

  @IsString()
  @MinLength(2)
  tipo!: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  arquivoUrl?: string;

  @IsOptional()
  @IsString()
  status?: "CONFORME" | "PARCIAL" | "NAO_CONFORME" | "SEM_EVIDENCIA";
}

class PopDto {
  @IsString()
  @MinLength(2)
  codigo!: string;

  @IsString()
  @MinLength(3)
  titulo!: string;

  @IsOptional()
  @IsString()
  versao?: string;

  @IsOptional()
  @IsString()
  procedimentoLaudoId?: string;
}

@Controller("estrategico")
@UseGuards(JwtAuthGuard)
export class EstrategicoController {
  constructor(private readonly estrategico: EstrategicoService) {}

  @Get("dashboard-executivo")
  dashboard(@CurrentUser() user: AuthUser) {
    return this.estrategico.dashboardExecutivo(user.estabelecimentoId);
  }

  @Get("maturidade/dominios")
  maturidade(@CurrentUser() user: AuthUser) {
    return this.estrategico.listMaturidade(user.estabelecimentoId);
  }

  @Put("maturidade/dominios/:id")
  avaliar(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: AvaliacaoDto) {
    return this.estrategico.upsertAvaliacao(user, id, body);
  }

  @Get("jornada")
  jornada(@CurrentUser() user: AuthUser) {
    return this.estrategico.getJornada(user.estabelecimentoId);
  }

  @Patch("jornada")
  setJornada(@CurrentUser() user: AuthUser, @Body() body: JornadaDto) {
    return this.estrategico.setJornada(user.estabelecimentoId, body.etapaAtual, body.notas);
  }

  @Get("requisitos")
  requisitos() {
    return this.estrategico.listRequisitos();
  }

  @Get("conformidade")
  conformidade(@CurrentUser() user: AuthUser) {
    return this.estrategico.centralConformidade(user.estabelecimentoId);
  }

  @Post("evidencias")
  evidencia(@CurrentUser() user: AuthUser, @Body() body: EvidenciaDto) {
    return this.estrategico.addEvidencia(user, body);
  }

  @Get("pops")
  pops(@CurrentUser() user: AuthUser, @Query("categoria") categoria?: string) {
    return this.estrategico.listPops(user.estabelecimentoId, categoria);
  }

  @Get("pops/:id/documento.pdf")
  async popPdf(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const doc = await this.estrategico.popDocumentoPdf(user.estabelecimentoId, id);
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${doc.nomeArquivo.replace(/"/g, "")}"`,
    );
    res.send(doc.conteudo);
  }

  @Post("pops")
  createPop(@CurrentUser() user: AuthUser, @Body() body: PopDto) {
    return this.estrategico.createPop(user, body);
  }

  @Get("recomendacoes")
  recomendacoes(@CurrentUser() user: AuthUser) {
    return this.estrategico.listRecomendacoes(user.estabelecimentoId);
  }
}
