import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { StatusSolicitacao, UrgenciaSolicitacao } from "@prisma/client";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { SolicitacoesService } from "./solicitacoes.service";

class CreateSolicitacaoDto {
  @IsString()
  @MinLength(3)
  descricao!: string;

  @IsString()
  @MinLength(2)
  setorNome!: string;

  @IsOptional()
  @IsEnum(UrgenciaSolicitacao)
  urgencia?: UrgenciaSolicitacao;

  @IsOptional()
  @IsString()
  equipamentoTag?: string;

  @IsOptional()
  @IsString()
  solicitanteNome?: string;

  @IsOptional()
  @IsString()
  ramal?: string;
}

class RecusarDto {
  @IsString()
  @MinLength(3)
  justificativa!: string;
}

class AprovarDto {
  @IsOptional()
  @IsString()
  responsavelId?: string;
}

class VincularDto {
  @IsString()
  equipamentoTag!: string;
}

@Controller("solicitacoes")
@UseGuards(JwtAuthGuard)
@RequirePermission("os", PERMISSAO_NIVEL.LEITURA)
export class SolicitacoesController {
  constructor(private readonly solicitacoes: SolicitacoesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("status") status?: StatusSolicitacao) {
    return this.solicitacoes.list(user, status);
  }

  /** Solicitante usa módulo portal (EDICAO); triagem usa os. */
  @RequirePermission("portal", PERMISSAO_NIVEL.EDICAO)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateSolicitacaoDto) {
    return this.solicitacoes.create(user, body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO_APROVACAO)
  @Post(":id/aprovar")
  aprovar(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: AprovarDto) {
    return this.solicitacoes.aprovar(user, id, body.responsavelId);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO_APROVACAO)
  @Post(":id/recusar")
  recusar(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: RecusarDto) {
    return this.solicitacoes.recusar(user, id, body.justificativa);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO_APROVACAO)
  @Patch(":id/equipamento")
  vincular(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: VincularDto) {
    return this.solicitacoes.vincularEquipamento(user, id, body.equipamentoTag);
  }
}
