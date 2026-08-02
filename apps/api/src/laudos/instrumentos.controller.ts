import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MinLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { InstrumentosService } from "./instrumentos.service";

class CreateInstrumentoDto {
  @IsString()
  @MinLength(2)
  nome!: string;

  @IsString()
  @MinLength(1)
  nSerie!: string;

  @IsOptional()
  @IsString()
  certificadoNumero?: string;

  @IsOptional()
  @IsString()
  certificadoEmissao?: string;

  @IsOptional()
  @IsString()
  certificadoValidade?: string;

  @IsOptional()
  @IsString()
  laboratorioEmissor?: string;
}

@Controller("instrumentos-padroes")
@UseGuards(JwtAuthGuard)
export class InstrumentosController {
  constructor(private readonly instrumentos: InstrumentosService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.instrumentos.list(user.estabelecimentoId, q);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateInstrumentoDto) {
    return this.instrumentos.create(user, body);
  }
}
