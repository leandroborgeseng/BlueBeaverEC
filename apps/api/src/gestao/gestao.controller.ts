import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { OrigemCapex, StatusCapex } from "@prisma/client";
import { IsEnum, IsNumber, IsOptional, IsString, MinLength } from "class-validator";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { GestaoService } from "./gestao.service";

class PlanoDto {
  @IsString()
  @MinLength(3)
  iniciativa!: string;

  @IsOptional()
  @IsString()
  horizonteTexto?: string;

  @IsOptional()
  @IsNumber()
  investimentoPrevisto?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

class CapexDto {
  @IsString()
  @MinLength(3)
  descricao!: string;

  @IsNumber()
  valorEstimado!: number;

  @IsString()
  @MinLength(3)
  justificativa!: string;

  @IsOptional()
  @IsString()
  equipamentoOrigemId?: string;

  @IsOptional()
  @IsEnum(OrigemCapex)
  origem?: OrigemCapex;
}

class StatusDto {
  @IsEnum(StatusCapex)
  status!: StatusCapex;
}

class CapexAutoDto {
  @IsOptional()
  @IsNumber()
  minScore?: number;
}

@Controller("gestao")
@UseGuards(JwtAuthGuard)
@RequirePermission("estrategico", PERMISSAO_NIVEL.LEITURA)
export class GestaoController {
  constructor(private readonly gestao: GestaoService) {}

  @Get("plano-diretor")
  plano(@CurrentUser() user: AuthUser) {
    return this.gestao.listPlanoDiretor(user.estabelecimentoId);
  }

  @Post("plano-diretor")
  @RequirePermission("estrategico", PERMISSAO_NIVEL.EDICAO)
  createPlano(@CurrentUser() user: AuthUser, @Body() body: PlanoDto) {
    return this.gestao.createPlanoDiretor(user, body);
  }

  @Patch("plano-diretor/:id")
  @RequirePermission("estrategico", PERMISSAO_NIVEL.EDICAO)
  patchPlano(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: PlanoDto) {
    return this.gestao.patchPlanoDiretor(user, id, body);
  }

  @Get("substituicao-tecnologica")
  subst(@CurrentUser() user: AuthUser) {
    return this.gestao.substituicaoTecnologica(user.estabelecimentoId);
  }

  @Get("capex")
  capex(@CurrentUser() user: AuthUser) {
    return this.gestao.listCapex(user.estabelecimentoId);
  }

  @Post("capex/gerar-automatico")
  @RequirePermission("estrategico", PERMISSAO_NIVEL.EDICAO)
  gerarAuto(@CurrentUser() user: AuthUser, @Body() body: CapexAutoDto) {
    return this.gestao.gerarCapexAutomatico(user, body.minScore ?? 40);
  }

  @Post("capex")
  @RequirePermission("estrategico", PERMISSAO_NIVEL.EDICAO)
  createCapex(@CurrentUser() user: AuthUser, @Body() body: CapexDto) {
    return this.gestao.createCapex(user, body);
  }

  @Patch("capex/:id")
  @RequirePermission("estrategico", PERMISSAO_NIVEL.EDICAO)
  patchCapex(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: StatusDto) {
    return this.gestao.patchCapex(user, id, body.status);
  }
}
