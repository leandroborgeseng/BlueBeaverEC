import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { EstoqueService } from "./estoque.service";

class CreateItemDto {
  @IsString()
  @MinLength(1)
  codigo!: string;

  @IsString()
  @MinLength(2)
  descricao!: string;

  @IsOptional()
  @IsString()
  almoxarifado?: string;

  @IsOptional()
  @IsNumber()
  qtdAtual?: number;

  @IsOptional()
  @IsNumber()
  qtdMinima?: number;

  @IsOptional()
  @IsNumber()
  valorUnitario?: number;
}

class BaixaDto {
  @IsString()
  itemCodigo!: string;

  @IsNumber()
  @Min(0.01)
  qtd!: number;

  @IsNumber()
  osNumero!: number;
}

class ReservaDto {
  @IsString()
  itemCodigo!: string;

  @IsNumber()
  @Min(0.01)
  qtd!: number;

  @IsNumber()
  osNumero!: number;
}

@Controller("estoque")
@UseGuards(JwtAuthGuard)
export class EstoqueController {
  constructor(private readonly estoque: EstoqueService) {}

  @Get("itens")
  list(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    return this.estoque.list(user.estabelecimentoId, q);
  }

  @Post("itens")
  create(@CurrentUser() user: AuthUser, @Body() body: CreateItemDto) {
    return this.estoque.create(user, body);
  }

  @Post("baixas")
  baixar(@CurrentUser() user: AuthUser, @Body() body: BaixaDto) {
    return this.estoque.baixar(user, body.itemCodigo, body.qtd, body.osNumero);
  }

  @Post("reservas")
  reservar(@CurrentUser() user: AuthUser, @Body() body: ReservaDto) {
    return this.estoque.reservar(user, body.itemCodigo, body.qtd, body.osNumero);
  }
}
