import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsArray, IsOptional, IsString, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
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
export class MobileController {
  constructor(private readonly mobile: MobileService) {}

  @Get("minhas-os")
  minhasOs(@CurrentUser() user: AuthUser) {
    return this.mobile.minhasOs(user);
  }

  @Get("kpis-hoje")
  kpis(@CurrentUser() user: AuthUser) {
    return this.mobile.kpisHoje(user);
  }

  @Get("equipamento/qr/:codigo")
  qr(@CurrentUser() user: AuthUser, @Param("codigo") codigo: string) {
    return this.mobile.equipamentoQr(user, codigo);
  }

  @Post("os/:numero/finalizar")
  finalizar(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: FinalizarDto,
  ) {
    return this.mobile.finalizar(user, Number(numero), body);
  }

  @Post("sync/queue")
  sync(@CurrentUser() user: AuthUser, @Body() body: SyncQueueDto) {
    return this.mobile.syncQueue(user, body.items ?? []);
  }
}
