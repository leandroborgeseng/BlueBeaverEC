import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PerfilAcesso } from "@prisma/client";
import { IsBoolean, IsEnum, IsNumber, IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
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
  permissoes!: Record<string, string>;
}

@Controller("config")
@UseGuards(JwtAuthGuard)
export class OrganizacaoConfigController {
  constructor(private readonly config: OrganizacaoConfigService) {}

  @Get("organizacao")
  org(@CurrentUser() user: AuthUser) {
    return this.config.getOrganizacao(user.estabelecimentoId);
  }

  @Patch("organizacao")
  patchOrg(@CurrentUser() user: AuthUser, @Body() body: OrgDto) {
    return this.config.patchOrganizacao(user, body);
  }

  @Get("usuarios")
  usuarios(@CurrentUser() user: AuthUser) {
    return this.config.listUsuarios(user.estabelecimentoId);
  }

  @Post("usuarios")
  createUsuario(@CurrentUser() user: AuthUser, @Body() body: UsuarioDto) {
    return this.config.createUsuario(user, body);
  }

  @Patch("usuarios/:id")
  patchUsuario(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: PatchUsuarioDto) {
    return this.config.patchUsuario(user, id, body);
  }

  @Get("perfis")
  perfis(@CurrentUser() user: AuthUser) {
    return this.config.listPerfis(user.estabelecimentoId);
  }

  @Post("perfis")
  createPerfil(@CurrentUser() user: AuthUser, @Body() body: PerfilDto) {
    return this.config.createPerfil(user, body);
  }

  @Get("logs-acesso")
  logs(@CurrentUser() user: AuthUser, @Query("de") de?: string, @Query("ate") ate?: string) {
    return this.config.logsAcesso(user.estabelecimentoId, de, ate);
  }
}
