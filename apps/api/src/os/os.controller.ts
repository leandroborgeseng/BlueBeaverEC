import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsEnum, IsIn, IsOptional, IsString, MinLength } from "class-validator";
import { PrioridadeOS, StatusOS, TipoOS } from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { OsService } from "./os.service";

class CreateOsDto {
  @IsString()
  equipamentoTag!: string;

  @IsOptional()
  @IsEnum(TipoOS)
  tipo?: TipoOS;

  @IsOptional()
  @IsEnum(PrioridadeOS)
  prioridade?: PrioridadeOS;

  @IsOptional()
  @IsString()
  oficina?: string;

  @IsOptional()
  @IsString()
  observacaoRequisicao?: string;

  @IsOptional()
  @IsString()
  pendencia?: string;

  @IsOptional()
  @IsString()
  responsavelId?: string;
}

class StatusDto {
  @IsIn(["fechar", "cancelar", "reabrir"])
  acao!: "fechar" | "cancelar" | "reabrir";

  @IsOptional()
  @IsString()
  justificativa?: string;
}

class AtribuirDto {
  @IsString()
  responsavelId!: string;
}

@Controller("os")
@UseGuards(JwtAuthGuard)
export class OsController {
  constructor(private readonly os: OsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("situacao") situacao?: StatusOS,
    @Query("q") q?: string,
    @Query("page") page?: string,
  ) {
    return this.os.list(user.estabelecimentoId, {
      situacao,
      q,
      page: page ? Number(page) : 1,
    });
  }

  @Get("nao-atribuidas")
  naoAtribuidas(@CurrentUser() user: AuthUser) {
    return this.os.naoAtribuidas(user.estabelecimentoId);
  }

  @Get("equipamento/:tag/ativas")
  ativas(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    return this.os.ativasDoEquipamento(user.estabelecimentoId, tag);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateOsDto) {
    return this.os.create(user, body);
  }

  @Patch(":numero/atribuir")
  atribuir(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: AtribuirDto,
  ) {
    return this.os.atribuir(user, Number(numero), body.responsavelId);
  }

  @Patch(":numero/status")
  status(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: StatusDto,
  ) {
    return this.os.changeStatus(user, Number(numero), body.acao, body.justificativa);
  }
}
