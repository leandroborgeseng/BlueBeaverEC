import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { Criticidade } from "@prisma/client";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { CadastrosService } from "./cadastros.service";

class NomeDto {
  @IsString()
  @MinLength(2)
  nome!: string;
}

class ModeloDto {
  @IsString()
  fabricanteId!: string;

  @IsString()
  @MinLength(1)
  nome!: string;
}

class FornecedorDto {
  @IsString()
  @MinLength(2)
  nome!: string;

  @IsOptional()
  @IsString()
  cnpj?: string;
}

class PlanoDto {
  @IsString()
  @MinLength(2)
  nome!: string;

  @IsOptional()
  @IsEnum(Criticidade)
  criticidade?: Criticidade;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  vidaUtilAnos?: number;
}

@Controller()
@UseGuards(JwtAuthGuard)
@RequirePermission("equipamentos", PERMISSAO_NIVEL.LEITURA)
export class CadastrosController {
  constructor(private readonly cadastros: CadastrosService) {}

  @Get("fabricantes")
  fabricantes(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.cadastros.fabricantes(user.estabelecimentoId, q);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post("fabricantes")
  createFabricante(@CurrentUser() user: AuthUser, @Body() body: NomeDto) {
    return this.cadastros.createFabricante(user, body.nome);
  }

  @Get("modelos")
  modelos(
    @CurrentUser() user: AuthUser,
    @Query("fabricanteId") fabricanteId?: string,
    @Query("q") q?: string,
  ) {
    return this.cadastros.modelos(user.estabelecimentoId, fabricanteId, q);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post("modelos")
  createModelo(@CurrentUser() user: AuthUser, @Body() body: ModeloDto) {
    return this.cadastros.createModelo(user, body.fabricanteId, body.nome);
  }

  @Get("setores")
  setores(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.cadastros.setores(user.estabelecimentoId, q);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post("setores")
  createSetor(@CurrentUser() user: AuthUser, @Body() body: NomeDto) {
    return this.cadastros.createSetor(user, body.nome);
  }

  @Get("fornecedores")
  fornecedores(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.cadastros.fornecedores(user.estabelecimentoId, q);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post("fornecedores")
  createFornecedor(@CurrentUser() user: AuthUser, @Body() body: FornecedorDto) {
    return this.cadastros.createFornecedor(user, body.nome, body.cnpj);
  }

  @Get("planos-descricao")
  planos(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.cadastros.planosDescricao(user.estabelecimentoId, q);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post("planos-descricao")
  createPlano(@CurrentUser() user: AuthUser, @Body() body: PlanoDto) {
    return this.cadastros.createPlano(user, body);
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Patch("planos-descricao/:id")
  updatePlano(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: PlanoDto) {
    return this.cadastros.updatePlano(user, id, body);
  }

  @Get("centros-custo")
  centros(@CurrentUser() user: AuthUser) {
    return this.cadastros.centrosCusto(user.estabelecimentoId);
  }

  @Get("colaboradores")
  colaboradores(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.cadastros.colaboradores(user.estabelecimentoId, q);
  }
}
