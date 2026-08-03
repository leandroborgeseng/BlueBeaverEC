import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { TipoOS } from "@prisma/client";
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
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

@Controller("planos")
@UseGuards(JwtAuthGuard)
export class PlanosController {
  constructor(private readonly planos: PlanosService) {}

  @Post("ramp-up/preview")
  preview(@CurrentUser() user: AuthUser, @Body() body: RampUpDto) {
    return this.planos.previewRampUp(user.estabelecimentoId, {
      horizonteDias: body.horizonteDias,
      inicio: body.inicio ? new Date(body.inicio) : undefined,
      forcarAnual: body.forcarAnual,
    });
  }

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
}
