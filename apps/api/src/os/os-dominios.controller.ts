import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { OS_DOMINIO_TIPOS, PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { OsDominiosService } from "./os-dominios.service";

const TIPOS = [...OS_DOMINIO_TIPOS];

class CriarOsDominioDto {
  @IsIn(TIPOS)
  tipo!: (typeof OS_DOMINIO_TIPOS)[number];

  @IsString()
  @MinLength(2)
  nome!: string;

  @IsOptional()
  @IsString()
  codigo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ordem?: number;
}

class AtualizarOsDominioDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  nome?: string;

  @IsOptional()
  @IsString()
  codigo?: string | null;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ordem?: number;
}

@Controller("os-dominios")
@UseGuards(JwtAuthGuard)
@RequirePermission("os", PERMISSAO_NIVEL.LEITURA)
export class OsDominiosController {
  constructor(private readonly dominios: OsDominiosService) {}

  @Get()
  listar(@CurrentUser() user: AuthUser, @Query("tipo") tipo?: string) {
    return this.dominios.listar(user.estabelecimentoId, tipo);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO_APROVACAO)
  @Post()
  criar(@CurrentUser() user: AuthUser, @Body() body: CriarOsDominioDto) {
    return this.dominios.criar(user.estabelecimentoId, body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO_APROVACAO)
  @Patch(":id")
  atualizar(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: AtualizarOsDominioDto) {
    return this.dominios.atualizar(user.estabelecimentoId, id, body);
  }
}
