import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PerfilAcesso } from "@prisma/client";
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { OrganizacaoConfigService } from "./organizacao-config.service";

class OrgDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  cnpj?: string;

  @IsOptional()
  @IsString()
  fusoHorario?: string;

  @IsOptional()
  @IsNumber()
  slaUrgenteHoras?: number;
}

class UsuarioDto {
  @IsString()
  email!: string;

  @IsString()
  @MinLength(2)
  nome!: string;

  @IsString()
  @MinLength(6)
  senha!: string;

  @IsEnum(PerfilAcesso)
  perfil!: PerfilAcesso;
}

class PatchUsuarioDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsEnum(PerfilAcesso)
  perfil?: PerfilAcesso;
}

class PerfilDto {
  @IsString()
  @MinLength(2)
  nome!: string;

  @IsObject()
  permissoes!: Record<string, string | number>;
}

class PatchPerfilDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsObject()
  permissoes?: Record<string, string | number>;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

@Controller("config")
@UseGuards(JwtAuthGuard)
@RequirePermission("config", PERMISSAO_NIVEL.LEITURA)
export class OrganizacaoConfigController {
  constructor(private readonly config: OrganizacaoConfigService) {}

  @Get("organizacao")
  org(@CurrentUser() user: AuthUser) {
    return this.config.getOrganizacao(user.estabelecimentoId);
  }

  @Patch("organizacao")
  @RequirePermission("config", PERMISSAO_NIVEL.EDICAO)
  patchOrg(@CurrentUser() user: AuthUser, @Body() body: OrgDto) {
    return this.config.patchOrganizacao(user, body);
  }

  @Get("usuarios")
  usuarios(@CurrentUser() user: AuthUser) {
    return this.config.listUsuarios(user.estabelecimentoId);
  }

  @Post("usuarios")
  @RequirePermission("config", PERMISSAO_NIVEL.EDICAO)
  createUsuario(@CurrentUser() user: AuthUser, @Body() body: UsuarioDto) {
    return this.config.createUsuario(user, body);
  }

  @Patch("usuarios/:id")
  @RequirePermission("config", PERMISSAO_NIVEL.EDICAO)
  patchUsuario(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: PatchUsuarioDto) {
    return this.config.patchUsuario(user, id, body);
  }

  @Get("perfis")
  perfis(@CurrentUser() user: AuthUser) {
    return this.config.listPerfis(user.estabelecimentoId);
  }

  @Post("perfis")
  @RequirePermission("config", PERMISSAO_NIVEL.EDICAO)
  createPerfil(@CurrentUser() user: AuthUser, @Body() body: PerfilDto) {
    return this.config.createPerfil(user, body);
  }

  @Patch("perfis/:id")
  @RequirePermission("config", PERMISSAO_NIVEL.EDICAO)
  patchPerfil(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: PatchPerfilDto) {
    return this.config.patchPerfil(user, id, body);
  }

  @Get("logs-acesso")
  logs(@CurrentUser() user: AuthUser, @Query("de") de?: string, @Query("ate") ate?: string) {
    return this.config.logsAcesso(user.estabelecimentoId, de, ate);
  }
}
