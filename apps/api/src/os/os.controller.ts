import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { PrioridadeOS, StatusOS, TipoOS } from "@prisma/client";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { OsService } from "./os.service";

class PecaDto {
  @IsString()
  itemCodigo!: string;

  @IsNumber()
  @Min(0.01)
  qtd!: number;
}

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PecaDto)
  pecas?: PecaDto[];
}

class MaoDeObraDto {
  @IsString()
  descricao!: string;

  @IsNumber()
  @Min(0.01)
  horas!: number;

  @IsOptional()
  @IsNumber()
  valorHora?: number;
}

class RapidaDto {
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
  responsavelId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PecaDto)
  pecas?: PecaDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => MaoDeObraDto)
  maoDeObra?: MaoDeObraDto;

  @IsOptional()
  @IsNumber()
  deslocamentoKm?: number;

  @IsOptional()
  @IsString()
  servicoExecutado?: string;

  @IsOptional()
  @IsBoolean()
  fechar?: boolean;
}

class StatusDto {
  @IsIn(["fechar", "cancelar", "reabrir", "iniciar", "pausar"])
  acao!: "fechar" | "cancelar" | "reabrir" | "iniciar" | "pausar";

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
@RequirePermission("os", PERMISSAO_NIVEL.LEITURA)
export class OsController {
  constructor(private readonly os: OsService) {}

  @Get("quadro-processos")
  async quadro(@CurrentUser() user: AuthUser) {
    const [abertas, andamento, concluidas, canceladas] = await Promise.all([
      this.os.list(user.estabelecimentoId, { situacao: StatusOS.ABERTA, page: 1 }),
      this.os.list(user.estabelecimentoId, { situacao: StatusOS.EM_ANDAMENTO, page: 1 }),
      this.os.list(user.estabelecimentoId, { situacao: StatusOS.CONCLUIDA, page: 1 }),
      this.os.list(user.estabelecimentoId, { situacao: StatusOS.CANCELADA, page: 1 }),
    ]);
    return {
      ABERTA: abertas.items,
      EM_ANDAMENTO: andamento.items,
      CONCLUIDA: concluidas.items,
      CANCELADA: canceladas.items,
    };
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("situacao") situacao?: StatusOS,
    @Query("prioridade") prioridade?: PrioridadeOS,
    @Query("q") q?: string,
    @Query("setor") setor?: string,
    @Query("oficina") oficina?: string,
    @Query("atrasada") atrasada?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.os.list(user.estabelecimentoId, {
      situacao,
      prioridade,
      q,
      setor,
      oficina,
      atrasada: atrasada === "1" || atrasada === "true" ? true : undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get("nao-atribuidas")
  naoAtribuidas(@CurrentUser() user: AuthUser) {
    return this.os.naoAtribuidas(user.estabelecimentoId);
  }

  @Get("auditoria")
  auditoria(
    @CurrentUser() user: AuthUser,
    @Query("acao") acao?: string,
    @Query("numero") numero?: string,
  ) {
    return this.os.auditoria(user.estabelecimentoId, {
      acao,
      numero: numero ? Number(numero) : undefined,
    });
  }

  @Get("equipamento/:tag/ativas")
  ativas(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    return this.os.ativasDoEquipamento(user.estabelecimentoId, tag);
  }

  @Get(":numero")
  detalhe(@CurrentUser() user: AuthUser, @Param("numero") numero: string) {
    return this.os.getByNumero(user.estabelecimentoId, Number(numero));
  }

  @Get(":numero/log")
  log(@CurrentUser() user: AuthUser, @Param("numero") numero: string) {
    return this.os.log(user.estabelecimentoId, Number(numero));
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateOsDto) {
    return this.os.create(user, body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post("rapida")
  rapida(@CurrentUser() user: AuthUser, @Body() body: RapidaDto) {
    return this.os.rapida(user, body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Patch(":numero/atribuir")
  atribuir(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: AtribuirDto,
  ) {
    return this.os.atribuir(user, Number(numero), body.responsavelId);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Patch(":numero/pendencia")
  pendencia(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: { pendencia?: string | null },
  ) {
    return this.os.updatePendencia(user, Number(numero), body.pendencia ?? null);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Patch(":numero/status")
  status(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: StatusDto,
  ) {
    return this.os.changeStatus(user, Number(numero), body.acao, body.justificativa);
  }
}
