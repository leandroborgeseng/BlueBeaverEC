import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { MobileService } from "./mobile.service";

class FinalizarDto {
  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsString()
  @MinLength(1)
  assinaturaBase64!: string;
}

class ChecklistItemDto {
  @IsString()
  id!: string;

  @IsString()
  label!: string;

  @IsBoolean()
  ok!: boolean;
}

class ChecklistDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  itens!: ChecklistItemDto[];
}

class FotoDto {
  @IsString()
  dataUrl!: string;

  @IsOptional()
  @IsString()
  legenda?: string;
}

class FotosDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FotoDto)
  fotos!: FotoDto[];
}

class PecasDto {
  @IsString()
  @MinLength(1)
  itemCodigo!: string;

  @IsNumber()
  @Min(0.01)
  qtd!: number;
}

class SyncItemDto {
  @IsString()
  clientId!: string;

  @IsString()
  type!: string;

  payload!: Record<string, unknown>;
}

class SyncQueueDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncItemDto)
  items!: SyncItemDto[];
}

@Controller("mobile")
@UseGuards(JwtAuthGuard)
@RequirePermission("os", PERMISSAO_NIVEL.LEITURA)
export class MobileController {
  constructor(private readonly mobile: MobileService) {}

  @Get("minhas-os")
  minhasOs(@CurrentUser() user: AuthUser) {
    return this.mobile.minhasOs(user);
  }

  @Get("proximos")
  proximos(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
    return this.mobile.proximos(user, limit ? Number(limit) : 5);
  }

  @Get("kpis-hoje")
  kpis(@CurrentUser() user: AuthUser) {
    return this.mobile.kpisHoje(user);
  }

  @Get("equipamento/qr/:codigo")
  qr(@CurrentUser() user: AuthUser, @Param("codigo") codigo: string) {
    return this.mobile.equipamentoQr(user, codigo);
  }

  @Get("os/:numero")
  detalhe(@CurrentUser() user: AuthUser, @Param("numero") numero: string) {
    return this.mobile.detalheOs(user, Number(numero));
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post("os/:numero/checklist")
  checklist(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: ChecklistDto,
  ) {
    return this.mobile.checklist(user, Number(numero), body.itens);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post("os/:numero/fotos")
  fotos(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: FotosDto,
  ) {
    return this.mobile.fotos(user, Number(numero), body.fotos);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post("os/:numero/pecas")
  pecas(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: PecasDto,
  ) {
    return this.mobile.pecas(user, Number(numero), body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post("os/:numero/finalizar")
  finalizar(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: FinalizarDto,
  ) {
    return this.mobile.finalizar(user, Number(numero), body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post("sync/queue")
  sync(@CurrentUser() user: AuthUser, @Body() body: SyncQueueDto) {
    return this.mobile.syncQueue(user, body.items ?? []);
  }
}
