import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { SituacaoEquipamento } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
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
}

@Controller("equipamentos")
@UseGuards(JwtAuthGuard)
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

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateEquipamentoDto) {
    return this.equipamentos.create(user, body);
  }

  @Get(":tag")
  byTag(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    const verValores = ["ENGENHEIRO", "GESTOR", "ADMIN"].includes(user.perfil);
    return this.equipamentos.byTag(user.estabelecimentoId, tag, verValores);
  }

  @Patch(":tag")
  update(
    @CurrentUser() user: AuthUser,
    @Param("tag") tag: string,
    @Body() body: UpdateEquipamentoDto,
  ) {
    return this.equipamentos.update(user, tag, body);
  }

  @Patch(":tag/tag")
  changeTag(@CurrentUser() user: AuthUser, @Param("tag") tag: string, @Body() body: ChangeTagDto) {
    return this.equipamentos.updateTag(user, tag, body.novaTag, body.justificativa);
  }

  @Post(":tag/arquivar")
  arquivar(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    return this.equipamentos.arquivar(user, tag);
  }

  @Post(":tag/reativar")
  reativar(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    return this.equipamentos.reativar(user, tag);
  }
}
