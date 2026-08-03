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
import { SituacaoEquipamento } from "@prisma/client";
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
  @IsString()
  tag!: string;

  @IsString()
  nome!: string;

  @IsString()
  descricaoId!: string;

  @IsString()
  fabricanteId!: string;

  @IsString()
  modeloId!: string;

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
  dataAquisicao?: string;

  @IsOptional()
  @IsNumber()
  valorAquisicao?: number;

  @IsOptional()
  @IsEnum(SituacaoEquipamento)
  situacao?: SituacaoEquipamento;
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
  observacao?: string;

  @IsOptional()
  @IsEnum(SituacaoEquipamento)
  situacao?: SituacaoEquipamento;

  @IsOptional()
  @IsNumber()
  valorAquisicao?: number;

  @IsOptional()
  @IsNumber()
  valorSubstituicao?: number;

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
}

class ImportRowDto {
  @IsString()
  tag!: string;

  @IsString()
  nome!: string;

  @IsString()
  planoDescricao!: string;

  @IsString()
  fabricante!: string;

  @IsString()
  modelo!: string;

  @IsString()
  setor!: string;

  @IsOptional()
  @IsString()
  patrimonio?: string;

  @IsOptional()
  @IsString()
  nSerie?: string;

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
  observacao?: string;
}

class ImportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows!: ImportRowDto[];
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
  ) {
    return this.equipamentos.list(user.estabelecimentoId, {
      setor,
      fabricante,
      modelo,
      situacao,
      q,
      page: page ? Number(page) : 1,
    });
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
  @Post("import")
  importRows(@CurrentUser() user: AuthUser, @Body() body: ImportDto) {
    return this.equipamentos.importRows(user, body.rows ?? []);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateEquipamentoDto) {
    return this.equipamentos.create(user, body);
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
