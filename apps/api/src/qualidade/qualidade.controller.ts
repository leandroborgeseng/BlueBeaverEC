import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import type { Response } from "express";
import {
  CategoriaDocumentoControlado,
  CondicaoUsoEquipamento,
  StatusAlertaCampo,
  StatusOcorrenciaSeguranca,
  TipoAlertaCampo,
  TipoOcorrenciaSeguranca,
  TipoTreinamentoQualidade,
  TipoVinculoDocumento,
} from "@prisma/client";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { QualidadeService } from "./qualidade.service";

class ArquivoDto {
  @IsOptional()
  @IsString()
  dataUrl?: string;

  @IsOptional()
  @IsString()
  nomeArquivo?: string;

  @IsOptional()
  @IsString()
  arquivoId?: string;
}

class CreateDocDto extends ArquivoDto {
  @IsString()
  @MinLength(3)
  titulo!: string;

  @IsEnum(CategoriaDocumentoControlado)
  categoria!: CategoriaDocumentoControlado;

  @IsOptional()
  @IsString()
  popId?: string;

  @IsOptional()
  @IsString()
  origemDocumentoEquipamentoTipo?: string;

  @IsOptional()
  @IsString()
  versao?: string;

  @IsOptional()
  @IsString()
  responsavelId?: string;

  @IsOptional()
  @IsString()
  dataRevisao?: string;

  @IsOptional()
  @IsString()
  proximaRevisao?: string;

  @IsOptional()
  @IsString()
  observacao?: string;
}

class VersaoDto extends ArquivoDto {
  @IsString()
  @MinLength(1)
  versao!: string;

  @IsOptional()
  @IsString()
  responsavelId?: string;

  @IsOptional()
  @IsString()
  dataRevisao?: string;

  @IsOptional()
  @IsString()
  proximaRevisao?: string;

  @IsOptional()
  @IsString()
  observacao?: string;
}

class VinculoDto {
  @IsEnum(TipoVinculoDocumento)
  tipo!: TipoVinculoDocumento;

  @IsOptional()
  @IsString()
  equipamentoId?: string;

  @IsOptional()
  @IsString()
  modeloId?: string;

  @IsOptional()
  @IsString()
  setorId?: string;

  @IsOptional()
  @IsString()
  tipoIntervencao?: string;
}

class CreateTreinoDto extends ArquivoDto {
  @IsString()
  @MinLength(3)
  tema!: string;

  @IsOptional()
  @IsEnum(TipoTreinamentoQualidade)
  tipo?: TipoTreinamentoQualidade;

  @IsString()
  @MinLength(2)
  instrutorNome!: string;

  @IsOptional()
  @IsString()
  instrutorId?: string;

  @IsString()
  data!: string;

  @IsOptional()
  @IsString()
  publico?: string;

  @IsOptional()
  @IsString()
  documentoId?: string;

  @IsOptional()
  @IsString()
  popId?: string;

  @IsOptional()
  @IsString()
  observacao?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipamentoIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  colaboradorIds?: string[];
}

class ParticipanteDto {
  @IsString()
  colaboradorId!: string;
}

class PresencaDto {
  @IsBoolean()
  presente!: boolean;
}

class EquipamentoIdDto {
  @IsString()
  equipamentoId!: string;
}

class CreateOcorrenciaDto {
  @IsEnum(TipoOcorrenciaSeguranca)
  tipo!: TipoOcorrenciaSeguranca;

  @IsOptional()
  @IsString()
  equipamentoId?: string;

  @IsOptional()
  @IsString()
  setorId?: string;

  @IsString()
  dataOcorrido!: string;

  @IsString()
  @MinLength(5)
  descricao!: string;

  @IsOptional()
  @IsString()
  medidasImediatas?: string;

  @IsOptional()
  @IsString()
  responsavelId?: string;

  @IsOptional()
  @IsString()
  ordemServicoId?: string;

  @IsOptional()
  @IsString()
  documentoId?: string;

  @IsOptional()
  @IsBoolean()
  acessoSensivel?: boolean;

  @IsOptional()
  @IsString()
  condicaoUsoSugerida?: string;
}

class InvestigacaoDto {
  @IsString()
  @MinLength(5)
  relato!: string;

  @IsOptional()
  @IsString()
  hipotese?: string;
}

class AcaoDto extends ArquivoDto {
  @IsString()
  @MinLength(3)
  descricao!: string;

  @IsOptional()
  @IsString()
  responsavelNome?: string;

  @IsOptional()
  @IsString()
  prazo?: string;
}

class StatusOcDto {
  @IsEnum(StatusOcorrenciaSeguranca)
  status!: StatusOcorrenciaSeguranca;
}

class CondicaoUsoDto {
  @IsEnum(CondicaoUsoEquipamento)
  condicao!: CondicaoUsoEquipamento;
}

class NcDto {
  @IsString()
  naoConformidadeId!: string;
}

class CreateAlertaDto {
  @IsEnum(TipoAlertaCampo)
  tipo!: TipoAlertaCampo;

  @IsString()
  @MinLength(3)
  titulo!: string;

  @IsString()
  @MinLength(2)
  origem!: string;

  @IsOptional()
  @IsString()
  dataRegistro?: string;

  @IsOptional()
  @IsString()
  prazo?: string;

  @IsOptional()
  @IsString()
  responsavelId?: string;

  @IsOptional()
  @IsString()
  protocoloComunicacaoExterna?: string;

  @IsOptional()
  @IsString()
  observacao?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipamentoIds?: string[];
}

class StatusAlertaDto {
  @IsEnum(StatusAlertaCampo)
  status!: StatusAlertaCampo;
}

@Controller("qualidade")
@UseGuards(JwtAuthGuard)
@RequirePermission("auditorias", PERMISSAO_NIVEL.LEITURA)
export class QualidadeController {
  constructor(private readonly qualidade: QualidadeService) {}

  @Get("resumo")
  resumo(@CurrentUser() user: AuthUser) {
    return this.qualidade.resumo(user);
  }

  @Get("pops")
  pops(@CurrentUser() user: AuthUser) {
    return this.qualidade.listPops(user);
  }

  @Get("busca")
  busca(
    @CurrentUser() user: AuthUser,
    @Query("q") q?: string,
    @Query("tipo") tipo?: string,
    @Query("setorId") setorId?: string,
    @Query("equipamentoId") equipamentoId?: string,
    @Query("de") de?: string,
    @Query("ate") ate?: string,
  ) {
    return this.qualidade.busca(user, { q, tipo, setorId, equipamentoId, de, ate });
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Get("export")
  async exportar(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query("q") q?: string,
    @Query("tipo") tipo?: string,
    @Query("setorId") setorId?: string,
    @Query("equipamentoId") equipamentoId?: string,
    @Query("de") de?: string,
    @Query("ate") ate?: string,
  ) {
    const out = await this.qualidade.exportar(user, { q, tipo, setorId, equipamentoId, de, ate });
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${out.filename}"`);
    res.send(out.buffer);
  }

  @Get("arquivos/:arquivoId")
  async arquivo(
    @CurrentUser() user: AuthUser,
    @Param("arquivoId") arquivoId: string,
    @Res() res: Response,
  ) {
    const arq = await this.qualidade.baixarArquivo(user, arquivoId);
    res.setHeader("Content-Type", arq.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${arq.nomeArquivo.replace(/"/g, "")}"`,
    );
    res.send(Buffer.from(arq.conteudo));
  }

  @Get("documentos")
  documentos(@CurrentUser() user: AuthUser) {
    return this.qualidade.listDocumentos(user);
  }

  @Get("documentos/:id")
  documento(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.qualidade.getDocumento(user, id);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("documentos")
  createDoc(@CurrentUser() user: AuthUser, @Body() body: CreateDocDto) {
    return this.qualidade.createDocumento(user, body);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("documentos/:id/versoes")
  addVersao(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: VersaoDto) {
    return this.qualidade.addVersao(user, id, body);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("documentos/:id/versoes/:vid/publicar")
  publicar(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("vid") vid: string,
  ) {
    return this.qualidade.publicarVersao(user, id, vid);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("documentos/:id/versoes/:vid/obsoletar")
  obsoletar(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("vid") vid: string,
  ) {
    return this.qualidade.obsoletarVersao(user, id, vid);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("documentos/:id/vinculos")
  vinculo(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: VinculoDto) {
    return this.qualidade.addVinculo(user, id, body);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Delete("documentos/:id/vinculos/:vid")
  removeVinculo(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("vid") vid: string,
  ) {
    return this.qualidade.removeVinculo(user, id, vid);
  }

  @Get("treinamentos")
  treinamentos(@CurrentUser() user: AuthUser) {
    return this.qualidade.listTreinamentos(user);
  }

  @Get("treinamentos/:id")
  treinamento(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.qualidade.getTreinamento(user, id);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("treinamentos")
  createTreino(@CurrentUser() user: AuthUser, @Body() body: CreateTreinoDto) {
    return this.qualidade.createTreinamento(user, body);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("treinamentos/:id/participantes")
  addPart(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: ParticipanteDto) {
    return this.qualidade.addParticipante(user, id, body.colaboradorId);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Patch("treinamentos/:id/participantes/:pid")
  presenca(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("pid") pid: string,
    @Body() body: PresencaDto,
  ) {
    return this.qualidade.marcarPresenca(user, id, pid, body.presente);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("treinamentos/:id/evidencias")
  evidTreino(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: ArquivoDto) {
    return this.qualidade.addEvidenciaTreino(user, id, body);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("treinamentos/:id/equipamentos")
  eqTreino(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: EquipamentoIdDto) {
    return this.qualidade.addEquipamentoTreino(user, id, body.equipamentoId);
  }

  @Get("ocorrencias")
  ocorrencias(@CurrentUser() user: AuthUser) {
    return this.qualidade.listOcorrencias(user);
  }

  @Get("ocorrencias/:id")
  ocorrencia(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.qualidade.getOcorrencia(user, id);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("ocorrencias")
  createOc(@CurrentUser() user: AuthUser, @Body() body: CreateOcorrenciaDto) {
    return this.qualidade.createOcorrencia(user, body);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("ocorrencias/:id/investigacao")
  investigacao(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: InvestigacaoDto) {
    return this.qualidade.addInvestigacao(user, id, body);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("ocorrencias/:id/acoes")
  acao(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: AcaoDto) {
    return this.qualidade.addAcao(user, id, body);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("ocorrencias/:id/acoes/:aid/concluir")
  concluirAcao(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("aid") aid: string,
  ) {
    return this.qualidade.concluirAcao(user, id, aid);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("ocorrencias/:id/status")
  statusOc(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: StatusOcDto) {
    return this.qualidade.statusOcorrencia(user, id, body.status);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO_APROVACAO)
  @Post("ocorrencias/:id/condicao-uso")
  condicao(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: CondicaoUsoDto) {
    return this.qualidade.aplicarCondicaoUso(user, id, body.condicao);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("ocorrencias/:id/nc")
  nc(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: NcDto) {
    return this.qualidade.vincularNc(user, id, body.naoConformidadeId);
  }

  @Get("alertas")
  alertas(@CurrentUser() user: AuthUser) {
    return this.qualidade.listAlertas(user);
  }

  @Get("alertas/:id")
  alerta(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.qualidade.getAlerta(user, id);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("alertas")
  createAlerta(@CurrentUser() user: AuthUser, @Body() body: CreateAlertaDto) {
    return this.qualidade.createAlerta(user, body);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("alertas/:id/equipamentos")
  eqAlerta(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: EquipamentoIdDto) {
    return this.qualidade.addEquipamentoAlerta(user, id, body.equipamentoId);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("alertas/:id/evidencias")
  evidAlerta(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: ArquivoDto) {
    return this.qualidade.addEvidenciaAlerta(user, id, body);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("alertas/:id/status")
  statusAlerta(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: StatusAlertaDto) {
    return this.qualidade.statusAlerta(user, id, body.status);
  }
}
