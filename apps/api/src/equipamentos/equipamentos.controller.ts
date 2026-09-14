import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
  CondicaoUsoEquipamento,
  Criticidade,
  EventoCicloVida,
  PropriedadeEquipamento,
  SituacaoEquipamento,
  TipoDocumentoEquipamento,
  TipoMovimentacaoEquipamento,
} from "@prisma/client";
import type { Response } from "express";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { EquipamentosService } from "./equipamentos.service";

class ChangeTagDto {
  @IsString()
  @MinLength(1)
  novaTag!: string;

  @IsString()
  @MinLength(3)
  justificativa!: string;
}

class CreateEquipamentoDto {
  @IsOptional()
  @IsString()
  tag?: string;

  @IsString()
  nome!: string;

  @IsOptional()
  @IsString()
  descricaoId?: string;

  @IsOptional()
  @IsString()
  fabricanteId?: string;

  @IsOptional()
  @IsString()
  modeloId?: string;

  @IsString()
  setorId!: string;

  @IsOptional()
  @IsString()
  fornecedorId?: string;

  @IsOptional()
  @IsString()
  centroCustoId?: string;

  @IsOptional()
  @IsString()
  patrimonio?: string;

  @IsOptional()
  @IsString()
  nSerie?: string;

  @IsOptional()
  @IsString()
  idInterna?: string;

  @IsOptional()
  @IsString()
  unidade?: string;

  @IsOptional()
  @IsString()
  localizacaoFisica?: string;

  @IsOptional()
  @IsEnum(PropriedadeEquipamento)
  propriedade?: PropriedadeEquipamento;

  @IsOptional()
  @IsString()
  dataAquisicao?: string;

  @IsOptional()
  @IsNumber()
  valorAquisicao?: number;

  @IsOptional()
  @IsString()
  garantiaInicio?: string;

  @IsOptional()
  @IsString()
  garantiaFim?: string;

  @IsOptional()
  @IsEnum(SituacaoEquipamento)
  situacao?: SituacaoEquipamento;

  @IsOptional()
  @IsEnum(CondicaoUsoEquipamento)
  condicaoUso?: CondicaoUsoEquipamento;

  @IsOptional()
  @IsEnum(Criticidade)
  criticidadeEquipamento?: Criticidade;

  @IsOptional()
  @IsString()
  criticidadeJustificativa?: string;

  @IsOptional()
  @IsString()
  criticidadeResponsavelId?: string;
}

class UpdateEquipamentoDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  setorId?: string;

  @IsOptional()
  @IsString()
  fabricanteId?: string;

  @IsOptional()
  @IsString()
  modeloId?: string;

  @IsOptional()
  @IsString()
  fornecedorId?: string;

  @IsOptional()
  @IsString()
  centroCustoId?: string;

  @IsOptional()
  @IsString()
  patrimonio?: string;

  @IsOptional()
  @IsString()
  nSerie?: string;

  @IsOptional()
  @IsString()
  idInterna?: string;

  @IsOptional()
  @IsString()
  unidade?: string;

  @IsOptional()
  @IsString()
  localizacaoFisica?: string;

  @IsOptional()
  @IsEnum(PropriedadeEquipamento)
  propriedade?: PropriedadeEquipamento;

  @IsOptional()
  @IsString()
  observacao?: string;

  @IsOptional()
  @IsEnum(SituacaoEquipamento)
  situacao?: SituacaoEquipamento;

  @IsOptional()
  @IsEnum(CondicaoUsoEquipamento)
  condicaoUso?: CondicaoUsoEquipamento;

  @IsOptional()
  @IsNumber()
  valorAquisicao?: number;

  @IsOptional()
  @IsNumber()
  valorSubstituicao?: number;

  @IsOptional()
  @IsString()
  dataAquisicao?: string;

  @IsOptional()
  @IsString()
  dataInstalacao?: string;

  @IsOptional()
  @IsString()
  garantiaInicio?: string;

  @IsOptional()
  @IsString()
  garantiaFim?: string;

  @IsOptional()
  @IsBoolean()
  checklistRecebimentoPendente?: boolean;

  @IsOptional()
  @IsString()
  registroAnvisa?: string;

  @IsOptional()
  @IsString()
  validadeAnvisa?: string;

  @IsOptional()
  @IsString()
  dataEndOfService?: string;

  @IsOptional()
  @IsString()
  dataEndOfLife?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsString()
  tipoEquipamentoPlanoId?: string | null;

  @IsOptional()
  @IsEnum(Criticidade)
  criticidadeEquipamento?: Criticidade;

  @IsOptional()
  @IsString()
  criticidadeJustificativa?: string;

  @IsOptional()
  @IsString()
  criticidadeResponsavelId?: string;
}

class ImportRowDto {
  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  planoDescricao?: string;

  @IsOptional()
  @IsString()
  fabricante?: string;

  @IsOptional()
  @IsString()
  modelo?: string;

  @IsOptional()
  @IsString()
  setor?: string;

  @IsOptional()
  @IsString()
  patrimonio?: string;

  @IsOptional()
  @IsString()
  nSerie?: string;

  @IsOptional()
  @IsString()
  idInterna?: string;

  @IsOptional()
  @IsString()
  unidade?: string;

  @IsOptional()
  @IsString()
  localizacaoFisica?: string;

  @IsOptional()
  @IsString()
  propriedade?: string;

  @IsOptional()
  @IsString()
  registroAnvisa?: string;

  @IsOptional()
  @IsString()
  validadeAnvisa?: string;

  @IsOptional()
  @IsString()
  dataAquisicao?: string;

  @IsOptional()
  @IsString()
  dataInstalacao?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valorAquisicao?: number;

  @IsOptional()
  @IsString()
  garantiaInicio?: string;

  @IsOptional()
  @IsString()
  garantiaFim?: string;

  @IsOptional()
  @IsString()
  observacao?: string;
}

class ImportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows!: ImportRowDto[];
}

class ImportPreviewDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows?: ImportRowDto[];

  @IsOptional()
  @IsString()
  filename?: string;

  @IsOptional()
  @IsString()
  contentBase64?: string;
}

class MovimentacaoDto {
  @IsEnum(TipoMovimentacaoEquipamento)
  tipo!: TipoMovimentacaoEquipamento;

  @IsOptional()
  @IsString()
  destinoSetorId?: string;

  @IsOptional()
  @IsString()
  destinoLocalizacao?: string;

  @IsOptional()
  @IsString()
  data?: string;

  @IsOptional()
  @IsString()
  responsavelNome?: string;

  @IsOptional()
  @IsString()
  responsavelId?: string;

  @IsString()
  @MinLength(3)
  motivo!: string;
}

class DocumentoDto {
  @IsEnum(TipoDocumentoEquipamento)
  tipo!: TipoDocumentoEquipamento;

  @IsString()
  dataUrl!: string;

  @IsOptional()
  @IsString()
  nomeArquivo?: string;

  @IsOptional()
  @IsString()
  descricao?: string;
}

class CicloDocDto {
  @IsString()
  dataUrl!: string;

  @IsOptional()
  @IsString()
  nomeArquivo?: string;
}

class CicloDto {
  @IsEnum(EventoCicloVida)
  tipo!: EventoCicloVida;

  @IsOptional()
  @IsString()
  data?: string;

  @IsOptional()
  @IsString()
  observacao?: string;

  @IsOptional()
  @IsString()
  motivoDesativacao?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CicloDocDto)
  documento?: CicloDocDto;
}

@Controller("equipamentos")
@UseGuards(JwtAuthGuard)
@RequirePermission("equipamentos", PERMISSAO_NIVEL.LEITURA)
export class EquipamentosController {
  constructor(private readonly equipamentos: EquipamentosService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("setor") setor?: string,
    @Query("fabricante") fabricante?: string,
    @Query("modelo") modelo?: string,
    @Query("situacao") situacao?: SituacaoEquipamento,
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.equipamentos.list(user.estabelecimentoId, {
      setor,
      fabricante,
      modelo,
      situacao,
      q,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get("proxima-tag")
  proximaTag(@CurrentUser() user: AuthUser) {
    return this.equipamentos.proximaTag(user.estabelecimentoId).then((tag) => ({ tag }));
  }

  @Get("import/template")
  async importTemplate(@Res() res: Response) {
    const buf = await this.equipamentos.importTemplate();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", 'attachment; filename="template-equipamentos.xlsx"');
    res.send(buf);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post("import/preview")
  async importPreview(@CurrentUser() user: AuthUser, @Body() body: ImportPreviewDto) {
    const rows = body.contentBase64
      ? await this.equipamentos.parseArquivoImport(body.filename ?? "import.csv", body.contentBase64)
      : (body.rows ?? []);
    return this.equipamentos.importPreview(user, rows);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post("import")
  importRows(@CurrentUser() user: AuthUser, @Body() body: ImportDto) {
    return this.equipamentos.importRows(user, body.rows ?? []);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateEquipamentoDto) {
    return this.equipamentos.create(user, body);
  }

  @Get("qr/:codigo")
  qr(@CurrentUser() user: AuthUser, @Param("codigo") codigo: string) {
    return this.equipamentos.byQr(user.estabelecimentoId, decodeURIComponent(codigo));
  }

  @Get(":tag/pagina")
  pagina(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    const verValores = ["ENGENHEIRO", "GESTOR", "ADMIN"].includes(user.perfil);
    return this.equipamentos.pagina(user, tag, verValores);
  }

  @Get(":tag/etiqueta")
  etiqueta(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    return this.equipamentos.etiqueta(user, tag);
  }

  @Get(":tag/documentos/:id")
  async documento(
    @CurrentUser() user: AuthUser,
    @Param("tag") tag: string,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const doc = await this.equipamentos.getDocumento(user, tag, id);
    res.setHeader("Content-Type", doc.mimeType);
    res.setHeader("Content-Disposition", `attachment; filename="${doc.nomeArquivo}"`);
    res.send(Buffer.from(doc.conteudo));
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post(":tag/documentos")
  addDocumento(@CurrentUser() user: AuthUser, @Param("tag") tag: string, @Body() body: DocumentoDto) {
    return this.equipamentos.addDocumento(user, tag, body);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post(":tag/movimentacoes")
  movimentar(@CurrentUser() user: AuthUser, @Param("tag") tag: string, @Body() body: MovimentacaoDto) {
    return this.equipamentos.movimentar(user, tag, body);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post(":tag/ciclo")
  ciclo(@CurrentUser() user: AuthUser, @Param("tag") tag: string, @Body() body: CicloDto) {
    return this.equipamentos.registrarCiclo(user, tag, body);
  }

  @Get(":tag")
  byTag(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    const verValores = ["ENGENHEIRO", "GESTOR", "ADMIN"].includes(user.perfil);
    return this.equipamentos.byTag(user.estabelecimentoId, tag, verValores);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Patch(":tag")
  update(
    @CurrentUser() user: AuthUser,
    @Param("tag") tag: string,
    @Body() body: UpdateEquipamentoDto,
  ) {
    return this.equipamentos.update(user, tag, body);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Patch(":tag/tag")
  changeTag(@CurrentUser() user: AuthUser, @Param("tag") tag: string, @Body() body: ChangeTagDto) {
    return this.equipamentos.updateTag(user, tag, body.novaTag, body.justificativa);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post(":tag/arquivar")
  arquivar(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    return this.equipamentos.arquivar(user, tag);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post(":tag/reativar")
  reativar(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    return this.equipamentos.reativar(user, tag);
  }
}
