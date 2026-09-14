import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { CondicaoUsoEquipamento } from "@prisma/client";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { AtendimentoExternoService } from "./atendimento-externo.service";

class AbrirDto {
  @IsString()
  fornecedorId!: string;

  @IsOptional()
  @IsString()
  contratoId?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}

class OrcamentoDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valor!: number;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  dataUrl?: string;

  @IsOptional()
  @IsString()
  nomeArquivo?: string;
}

class DecisaoDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  versao?: number;

  @IsEnum(["APROVADO", "REPROVADO"])
  decisao!: "APROVADO" | "REPROVADO";

  @IsEnum(["APROVACAO_INTERNA", "AUTORIZACAO_EXTERNA"])
  modo!: "APROVACAO_INTERNA" | "AUTORIZACAO_EXTERNA";

  @IsOptional()
  @IsString()
  responsavelExterno?: string;

  @IsOptional()
  @IsString()
  dataAutorizacaoExterna?: string;

  @IsOptional()
  @IsString()
  autorizacaoExternaObs?: string;
}

class EnvioDto {
  @IsOptional()
  @IsString()
  transporte?: string;

  @IsOptional()
  @IsString()
  acessorios?: string;

  @IsOptional()
  @IsString()
  previsaoRetorno?: string;

  @IsOptional()
  @IsString()
  identificacaoEquipamento?: string;

  @IsOptional()
  @IsString()
  dataUrl?: string;

  @IsOptional()
  @IsString()
  nomeArquivo?: string;
}

class ConferenciaDto {
  @IsBoolean()
  ok!: boolean;

  @IsEnum(CondicaoUsoEquipamento)
  condicaoFinal!: CondicaoUsoEquipamento;

  @IsOptional()
  @IsString()
  observacao?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  custoRealizado?: number;
}

@Controller("atendimentos-externos")
@UseGuards(JwtAuthGuard)
@RequirePermission("os", PERMISSAO_NIVEL.LEITURA)
export class AtendimentoExternoController {
  constructor(private readonly atendimento: AtendimentoExternoService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("pendencias") pendencias?: string) {
    if (pendencias === "0") return this.atendimento.listPendencias(user);
    return this.atendimento.listPendencias(user);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.atendimento.get(user, id);
  }

  @Get(":id/documentos/:docId")
  async doc(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("docId") docId: string,
    @Res() res: Response,
  ) {
    const doc = await this.atendimento.baixarDocumento(user, id, docId);
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.nomeArquivo.replace(/"/g, "")}"`);
    res.send(Buffer.from(doc.conteudo));
  }

  @Get(":id/orcamentos/:orcId")
  async orc(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("orcId") orcId: string,
    @Res() res: Response,
  ) {
    const orc = await this.atendimento.baixarOrcamento(user, id, orcId);
    res.setHeader("Content-Type", orc.mimeType || "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${(orc.nomeArquivo || "orcamento").replace(/"/g, "")}"`,
    );
    res.send(Buffer.from(orc.conteudo!));
  }
}

@Controller("os")
@UseGuards(JwtAuthGuard)
@RequirePermission("os", PERMISSAO_NIVEL.LEITURA)
export class OsAtendimentoExternoController {
  constructor(private readonly atendimento: AtendimentoExternoService) {}

  @Get(":numero/atendimento-externo")
  porOs(@CurrentUser() user: AuthUser, @Param("numero") numero: string) {
    return this.atendimento.getByOs(user, Number(numero));
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post(":numero/atendimento-externo")
  abrir(@CurrentUser() user: AuthUser, @Param("numero") numero: string, @Body() body: AbrirDto) {
    return this.atendimento.abrir(user, Number(numero), body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post(":numero/atendimento-externo/orcamentos")
  orcamento(@CurrentUser() user: AuthUser, @Param("numero") numero: string, @Body() body: OrcamentoDto) {
    return this.atendimento.registrarOrcamento(user, Number(numero), body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post(":numero/atendimento-externo/decisao")
  decisao(@CurrentUser() user: AuthUser, @Param("numero") numero: string, @Body() body: DecisaoDto) {
    return this.atendimento.decidir(user, Number(numero), body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post(":numero/atendimento-externo/envio")
  envio(@CurrentUser() user: AuthUser, @Param("numero") numero: string, @Body() body: EnvioDto) {
    return this.atendimento.enviar(user, Number(numero), body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post(":numero/atendimento-externo/previsao")
  previsao(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: { previsaoRetorno: string },
  ) {
    return this.atendimento.previsao(user, Number(numero), body.previsaoRetorno);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post(":numero/atendimento-externo/retorno")
  retorno(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body()
    body: { custoRealizado?: number; dataUrl?: string; nomeArquivo?: string; acessorios?: string },
  ) {
    return this.atendimento.retornar(user, Number(numero), body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post(":numero/atendimento-externo/conferencia")
  conferencia(@CurrentUser() user: AuthUser, @Param("numero") numero: string, @Body() body: ConferenciaDto) {
    return this.atendimento.conferir(user, Number(numero), body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post(":numero/atendimento-externo/cancelar")
  cancelar(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: { motivo: string },
  ) {
    return this.atendimento.cancelar(user, Number(numero), body.motivo);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post(":numero/atendimento-externo/documentos")
  documento(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: { tipo?: string; dataUrl: string; nomeArquivo?: string; descricao?: string },
  ) {
    return this.atendimento.addDocumento(user, Number(numero), body);
  }
}
