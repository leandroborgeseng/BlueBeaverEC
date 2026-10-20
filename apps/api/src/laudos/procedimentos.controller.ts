import { Body, Controller, Get, Header, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString, Min, MinLength } from "class-validator";
import { TipoDocumentoEmitido, TipoLaudo } from "@prisma/client";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { ProcedimentosService } from "./procedimentos.service";

/** Crit. 5 — exportado para teste do ValidationPipe (tsx não emite metadata). */
export class CreateProcDto {
  @IsString()
  @MinLength(1)
  codigo!: string;

  @IsString()
  @MinLength(2)
  tituloLaudo!: string;

  @IsOptional()
  @IsString()
  nome?: string;

  @IsEnum(TipoLaudo)
  tipo!: TipoLaudo;

  @IsOptional()
  @IsEnum(TipoDocumentoEmitido)
  tipoDocumento?: TipoDocumentoEmitido;

  @IsOptional()
  @IsBoolean()
  generico?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  validadeMeses?: number;

  @IsOptional()
  @IsString()
  norma?: string;

  @IsOptional()
  @IsString()
  paiId?: string;

  /** Depreciado (Q7): itens planos não são mais aceitos na criação. */
  @IsOptional()
  @IsArray()
  itens?: unknown[];
}

export class RascunhoDto {
  @IsString()
  atualizadoEm!: string;

  @IsOptional() @IsString() codigo?: string;
  @IsOptional() @IsString() tituloLaudo?: string;
  @IsOptional() @IsEnum(TipoDocumentoEmitido) tipoDocumento?: TipoDocumentoEmitido;
  @IsOptional() @IsBoolean() generico?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) validadeMeses?: number;
  @IsOptional() @IsString() norma?: string | null;
  @IsOptional() @IsString() paiId?: string | null;
  @IsOptional() @IsObject() arvore?: Record<string, unknown>;
  @IsOptional() @IsObject() certificadoCfg?: Record<string, unknown>;
  @IsOptional() @IsString() criterioReferencia?: string | null;
  @IsOptional() @IsString() criterioVersao?: string | null;
}

export class PublicarDto {
  @IsOptional()
  @IsBoolean()
  confirmarAvisos?: boolean;
}

class VincularDto {
  @IsString()
  modeloId!: string;
}

class VincularPlanoDto {
  @IsString()
  planoTesteId!: string;
}

const DEPRECATION_LINK = '</procedimentos-laudo/{id}/versoes>; rel="successor-version"';

@Controller("procedimentos-laudo")
@UseGuards(JwtAuthGuard)
@RequirePermission("laudos", PERMISSAO_NIVEL.LEITURA)
export class ProcedimentosController {
  constructor(private readonly procedimentos: ProcedimentosService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("tipo") tipo?: TipoLaudo, @Query("inativos") inativos?: string) {
    return this.procedimentos.list(user.estabelecimentoId, tipo, inativos === "1" || inativos === "true");
  }

  @Get(":id")
  byId(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.procedimentos.byId(user.estabelecimentoId, id);
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateProcDto) {
    return this.procedimentos.create(user, body);
  }

  @Get(":id/versoes")
  versoes(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.procedimentos.versoes(user.estabelecimentoId, id);
  }

  @Get(":id/versoes/:vid")
  versao(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("vid") vid: string) {
    return this.procedimentos.versao(user.estabelecimentoId, id, vid);
  }

  @Get(":id/diff")
  diff(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("de") de: string, @Query("para") para: string) {
    return this.procedimentos.diff(user.estabelecimentoId, id, de, para);
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Post(":id/rascunho")
  abrirRascunho(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.procedimentos.abrirRascunho(user, id);
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Patch(":id/versoes/:vid")
  salvar(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("vid") vid: string, @Body() body: RascunhoDto) {
    return this.procedimentos.salvarRascunho(user, id, vid, body);
  }

  @Get(":id/versoes/:vid/validacao")
  validacao(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("vid") vid: string) {
    return this.procedimentos.previaPublicacao(user, id, vid);
  }

  /** Exige também a permissão especial `procedimento.publicar` (checada no serviço, Q1). */
  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Post(":id/versoes/:vid/publicar")
  publicar(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("vid") vid: string, @Body() body: PublicarDto) {
    return this.procedimentos.publicar(user, id, vid, body ?? {});
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO_APROVACAO)
  @Post(":id/inativar")
  inativar(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.procedimentos.inativar(user, id);
  }

  /** Q7 — depreciada: só leitura; some na E3. */
  @Get(":id/itens")
  @Header("Deprecation", "true")
  @Header("Sunset", "E3")
  @Header("Link", DEPRECATION_LINK)
  itensLegado(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.procedimentos.itensDepreciados(user.estabelecimentoId, id);
  }

  /** Q7 — depreciada: escrita desativada (410). */
  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Patch(":id/itens")
  @Header("Deprecation", "true")
  @Header("Link", DEPRECATION_LINK)
  itens() {
    return this.procedimentos.rotaDepreciada();
  }

  /** Q7 — depreciada: critério agora é editado no rascunho (exige aprovação em Laudos). */
  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO_APROVACAO)
  @Patch(":id/criterio")
  @Header("Deprecation", "true")
  @Header("Link", DEPRECATION_LINK)
  criterio() {
    return this.procedimentos.rotaDepreciada();
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Post(":id/vincular")
  vincular(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: VincularDto) {
    return this.procedimentos.vincularModelo(user, id, body.modeloId);
  }

  @RequirePermission("laudos", PERMISSAO_NIVEL.EDICAO)
  @Post(":id/planos")
  vincularPlano(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: VincularPlanoDto) {
    return this.procedimentos.vincularPlano(user, id, body.planoTesteId);
  }
}
