import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MinLength } from "class-validator";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { AuditoriasService } from "./auditorias.service";

class CreateAudDto {
  @IsString()
  @MinLength(3)
  escopo!: string;

  @IsOptional()
  @IsString()
  responsavelId?: string;
}

class CreateNcDto {
  @IsString()
  @MinLength(3)
  descricao!: string;

  @IsString()
  origem!: string;

  @IsOptional()
  @IsString()
  auditoriaId?: string;

  @IsOptional()
  @IsString()
  ordemServicoId?: string;
}

class JustificativaDto {
  @IsString()
  @MinLength(3)
  justificativa!: string;
}

class PlanoDto {
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

@Controller()
@UseGuards(JwtAuthGuard)
@RequirePermission("auditorias", PERMISSAO_NIVEL.LEITURA)
export class AuditoriasController {
  constructor(private readonly auditorias: AuditoriasService) {}

  @Get("auditorias")
  list(@CurrentUser() user: AuthUser) {
    return this.auditorias.list(user.estabelecimentoId);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("auditorias")
  create(@CurrentUser() user: AuthUser, @Body() body: CreateAudDto) {
    return this.auditorias.create(user, body);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("auditorias/:id/iniciar")
  iniciar(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.auditorias.iniciar(user, id);
  }

  @Get("nao-conformidades")
  listNc(@CurrentUser() user: AuthUser) {
    return this.auditorias.listNc(user.estabelecimentoId);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("nao-conformidades")
  createNc(@CurrentUser() user: AuthUser, @Body() body: CreateNcDto) {
    return this.auditorias.createNc(user, body);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("nao-conformidades/:id/fechar")
  fechar(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: JustificativaDto) {
    return this.auditorias.fecharNc(user, id, body.justificativa);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO_APROVACAO)
  @Post("nao-conformidades/:id/reabrir")
  reabrir(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: JustificativaDto) {
    return this.auditorias.reabrirNc(user, id, body.justificativa);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("nao-conformidades/:id/planos-acao")
  plano(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: PlanoDto) {
    return this.auditorias.addPlano(user, id, body);
  }

  @RequirePermission("auditorias", PERMISSAO_NIVEL.EDICAO)
  @Post("auditorias/escalonar-planos")
  escalonar(@CurrentUser() user: AuthUser) {
    return this.auditorias.escalonarVencidos(user.estabelecimentoId);
  }
}
