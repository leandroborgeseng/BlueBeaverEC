import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from "class-validator";
import { SituacaoComponenteRecuperado } from "@prisma/client";
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
  @Type(() => Number)
  @IsNumber()
  qtdAtual?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  qtdMinima?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valorUnitario?: number;
}

class BaixaDto {
  @IsString()
  itemCodigo!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  qtd!: number;

  @Type(() => Number)
  @IsNumber()
  osNumero!: number;
}

class ReservaDto {
  @IsString()
  itemCodigo!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  qtd!: number;

  @Type(() => Number)
  @IsNumber()
  osNumero!: number;
}

class CreateCompDto {
  @IsString()
  @MinLength(2)
  itemDescricao!: string;

  @IsString()
  equipamentoOrigemTag!: string;

  @IsOptional()
  @IsString()
  dataRetirada?: string;
}

class UpdateCompDto {
  @IsEnum(SituacaoComponenteRecuperado)
  situacao!: SituacaoComponenteRecuperado;

  @IsOptional()
  @IsString()
  equipamentoDestinoTag?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  osDestinoNumero?: number;
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

  @Get("componentes-recuperados")
  componentes(@CurrentUser() user: AuthUser) {
    return this.estoque.listComponentes(user.estabelecimentoId);
  }

  @Post("componentes-recuperados")
  createComp(@CurrentUser() user: AuthUser, @Body() body: CreateCompDto) {
    return this.estoque.createComponente(user, body);
  }

  @Patch("componentes-recuperados/:id")
  updateComp(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: UpdateCompDto,
  ) {
    return this.estoque.updateComponente(user, id, body);
  }
}
