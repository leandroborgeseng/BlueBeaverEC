import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { StatusPlanoInstancia, TipoAtividadePlano, TipoOS } from "@prisma/client";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";
import { Type } from "class-transformer";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { PlanosService } from "./planos.service";

class RampUpDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(14)
  @Max(180)
  horizonteDias?: number;

  @IsOptional()
  @IsString()
  inicio?: string;

  @IsOptional()
  @IsBoolean()
  forcarAnual?: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

class UpsertPlanoDto {
  @IsOptional()
  @IsString()
  equipamentoId?: string;

  @IsOptional()
  @IsString()
  modeloId?: string;

  @IsEnum(TipoAtividadePlano)
  tipo!: TipoAtividadePlano;

  @IsOptional()
  @IsString()
  tipoCustomNome?: string;

  @IsOptional()
  @IsString()
  grupoNome?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  periodicidadeMeses?: number;

  @IsOptional()
  @IsString()
  fontePeriodicidade?: "FABRICANTE" | "PROCEDIMENTO" | "OUTRA";

  @IsOptional()
  @IsString()
  fontePeriodicidadeObs?: string;

  @IsOptional()
  @IsString()
  modoAgendamento?: "CALENDARIO_FIXO" | "INTERVALO_EXECUCAO";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  diaFixo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  mesFixo?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(180)
  antecedenciaDias?: number;

  @IsOptional()
  @IsString()
  proximaData?: string;

  @IsOptional()
  @IsString()
  responsavelId?: string;

  @IsOptional()
  @IsString()
  executorTipo?: "INTERNO" | "EXTERNO";

  @IsOptional()
  @IsString()
  fornecedorId?: string;

  @IsOptional()
  @IsString()
  procedimentoCodigo?: string;
}

class ReprogramarDto {
  @IsString()
  novaData!: string;

  @IsString()
  @MinLength(3)
  motivo!: string;
}

class StatusPlanoDto {
  @IsEnum(StatusPlanoInstancia)
  status!: StatusPlanoInstancia;

  @IsOptional()
  @IsString()
  motivo?: string;
}

class DistribuirDto {
  @IsArray()
  @IsString({ each: true })
  colaboradorIds!: string[];

  @IsOptional()
  @IsString()
  de?: string;

  @IsOptional()
  @IsString()
  ate?: string;
}

class TipoCustomDto {
  @IsString()
  @MinLength(2)
  nome!: string;
}

@Controller("planos")
@UseGuards(JwtAuthGuard)
@RequirePermission("os", PERMISSAO_NIVEL.LEITURA)
export class PlanosController {
  constructor(private readonly planos: PlanosService) {}

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post("ramp-up/preview")
  preview(@CurrentUser() user: AuthUser, @Body() body: RampUpDto) {
    return this.planos.previewRampUp(user.estabelecimentoId, {
      horizonteDias: body.horizonteDias,
      inicio: body.inicio ? new Date(body.inicio) : undefined,
      forcarAnual: body.forcarAnual,
    });
  }

  @RequirePermission("equipamentos", PERMISSAO_NIVEL.EDICAO)
  @Post("ramp-up")
  gerar(@CurrentUser() user: AuthUser, @Body() body: RampUpDto) {
    if (body.dryRun) {
      return this.planos.previewRampUp(user.estabelecimentoId, {
        horizonteDias: body.horizonteDias,
        inicio: body.inicio ? new Date(body.inicio) : undefined,
        forcarAnual: body.forcarAnual,
      });
    }
    return this.planos.gerarRampUp(user, {
      horizonteDias: body.horizonteDias,
      inicio: body.inicio ? new Date(body.inicio) : undefined,
      forcarAnual: body.forcarAnual,
    });
  }

  @Get("tipos-equipamento")
  tiposEquipamento(@CurrentUser() user: AuthUser) {
    return this.planos.listTiposEquipamento(user.estabelecimentoId);
  }

  @Get("tipos-custom")
  tiposCustom(@CurrentUser() user: AuthUser) {
    return this.planos.tiposCustom(user.estabelecimentoId);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post("tipos-custom")
  criarTipoCustom(@CurrentUser() user: AuthUser, @Body() body: TipoCustomDto) {
    return this.planos.criarTipoCustom(user, body.nome);
  }

  @Get("calendario")
  calendario(
    @CurrentUser() user: AuthUser,
    @Query("de") de?: string,
    @Query("ate") ate?: string,
    @Query("tipos") tipos?: string,
  ) {
    const tiposList = tipos
      ? (tipos.split(",").map((t) => t.trim().toUpperCase()) as TipoOS[])
      : undefined;
    return this.planos.calendario(user.estabelecimentoId, { de, ate, tipos: tiposList });
  }

  @Get("agenda")
  agenda(
    @CurrentUser() user: AuthUser,
    @Query("de") de?: string,
    @Query("ate") ate?: string,
    @Query("tipo") tipo?: string,
    @Query("status") status?: string,
    @Query("setorId") setorId?: string,
    @Query("q") q?: string,
    @Query("executorTipo") executorTipo?: string,
  ) {
    return this.planos.agenda(user.estabelecimentoId, { de, ate, tipo, status, setorId, q, executorTipo });
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post("sincronizar")
  sincronizar(@CurrentUser() user: AuthUser) {
    return this.planos.sincronizar(user);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post("gerar-os")
  gerarPendentes(@CurrentUser() user: AuthUser, @Body() body: { soFalhas?: boolean }) {
    return this.planos.gerarPendentes(user, Boolean(body?.soFalhas));
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post("ocorrencias/:id/gerar-os")
  gerarUma(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.planos.gerarOcorrencia(user, id);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post("ocorrencias/:id/reprogramar")
  reprogramar(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: ReprogramarDto) {
    return this.planos.reprogramar(user, id, body.novaData, body.motivo);
  }

  @Get("ocorrencias/:id")
  detalhe(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.planos.ocorrenciaDetalhe(user, id);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post("instancias")
  upsert(@CurrentUser() user: AuthUser, @Body() body: UpsertPlanoDto) {
    return this.planos.upsertPlano(user, body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post("instancias/:id/status")
  statusPlano(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: StatusPlanoDto) {
    return this.planos.alterarStatusPlano(user, id, body.status, body.motivo);
  }

  @Get("instancias/:id/historico")
  historico(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.planos.historico(user, id);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post("distribuir")
  distribuir(@CurrentUser() user: AuthUser, @Body() body: DistribuirDto) {
    return this.planos.distribuir(user, body.colaboradorIds, body.de, body.ate);
  }
}
