import { Body, Controller, Get, Header, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from "class-validator";
import { NaturezaCustoOS, OrigemMaterialOS, SituacaoComponenteRecuperado, TipoItemOS, TipoMovimentoEstoque } from "@prisma/client";
import { PERMISSAO_NIVEL, podeVerFinanceiro } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
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
  unidade?: string;

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

  @IsOptional()
  @IsBoolean()
  controlaLote?: boolean;

  @IsOptional()
  @IsString()
  lote?: string;

  @IsOptional()
  @IsString()
  numeroSerie?: string;

  @IsOptional()
  @IsString()
  validade?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modeloIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipamentoTags?: string[];
}

class PatchItemDto {
  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsString()
  unidade?: string;

  @IsOptional()
  @IsString()
  almoxarifado?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  qtdMinima?: number;

  @IsOptional()
  @IsBoolean()
  controlaLote?: boolean;

  @IsOptional()
  @IsString()
  lote?: string;

  @IsOptional()
  @IsString()
  numeroSerie?: string;

  @IsOptional()
  @IsString()
  validade?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modeloIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  equipamentoTags?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  qtdAtual?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valorUnitario?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsString()
  motivoInativacao?: string;
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

  @IsOptional()
  @IsString()
  chaveIdempotencia?: string;

  @IsOptional()
  @IsString()
  documento?: string;
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

class EntradaDto {
  @IsString()
  itemCodigo!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  qtd!: number;

  @IsOptional()
  @IsString()
  motivo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  custoUnitario?: number;

  @IsOptional()
  @IsString()
  documento?: string;

  @IsOptional()
  @IsString()
  origem?: string;

  @IsOptional()
  @IsString()
  destino?: string;
}

class ReposicaoDto {
  @IsString()
  itemCodigo!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  qtd!: number;

  @IsOptional()
  @IsString()
  observacao?: string;
}

class AjusteDto {
  @IsString()
  itemCodigo!: string;

  @Type(() => Number)
  @IsNumber()
  qtd!: number;

  @IsString()
  @MinLength(3)
  motivo!: string;

  @IsOptional()
  @IsString()
  documento?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  custoUnitario?: number;
}

class DevolucaoDto {
  @IsString()
  movimentoId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  qtd?: number;

  @IsOptional()
  @IsString()
  motivo?: string;
}

class EstornoDto {
  @IsString()
  movimentoId!: string;

  @IsOptional()
  @IsString()
  motivo?: string;
}

class CustoOsDto {
  @IsEnum(TipoItemOS)
  tipo!: TipoItemOS;

  @IsString()
  @MinLength(2)
  descricao!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  quantidade?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  valorUnitario?: number;

  @IsOptional()
  @IsEnum(OrigemMaterialOS)
  origemMaterial?: OrigemMaterialOS;

  @IsOptional()
  @IsEnum(NaturezaCustoOS)
  naturezaCusto?: NaturezaCustoOS;

  @IsOptional()
  @IsString()
  itemCodigo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  qtd?: number;
}

@Controller("estoque")
@UseGuards(JwtAuthGuard)
@RequirePermission("estoque", PERMISSAO_NIVEL.LEITURA)
export class EstoqueController {
  constructor(private readonly estoque: EstoqueService) {}

  @Get("metodo-valorizacao")
  metodo() {
    return this.estoque.metodoValorizacao();
  }

  @Get("itens")
  async list(
    @CurrentUser() user: AuthUser,
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("almoxarifado") almoxarifado?: string,
    @Query("abaixoMinimo") abaixoMinimo?: string,
    @Query("incluirInativos") incluirInativos?: string,
    @Query("equipamentoTag") equipamentoTag?: string,
  ) {
    const data = await this.estoque.list(user.estabelecimentoId, {
      q,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
      almoxarifado,
      abaixoMinimo: abaixoMinimo === "1" || abaixoMinimo === "true",
      incluirInativos: incluirInativos === "1" || incluirInativos === "true",
      equipamentoTag,
    });
    if (podeVerFinanceiro(user.perfil, user.permissoesModulos)) return data;
    return {
      ...data,
      items: data.items.map((i) => ({ ...i, valorUnitario: null })),
    };
  }

  @Get("itens/:codigo")
  get(@CurrentUser() user: AuthUser, @Param("codigo") codigo: string) {
    return this.estoque.getByCodigo(user.estabelecimentoId, codigo);
  }

  @Get("movimentos")
  async movimentos(
    @CurrentUser() user: AuthUser,
    @Query("itemCodigo") itemCodigo?: string,
    @Query("tipo") tipo?: TipoMovimentoEstoque,
    @Query("osNumero") osNumero?: string,
    @Query("almoxarifado") almoxarifado?: string,
  ) {
    const list = await this.estoque.movimentos(user.estabelecimentoId, {
      itemCodigo,
      tipo,
      osNumero: osNumero ? Number(osNumero) : undefined,
      almoxarifado,
    });
    if (podeVerFinanceiro(user.perfil, user.permissoesModulos)) return list;
    return list.map((m) => ({ ...m, custoUnitario: null }));
  }

  @Get("custos")
  custos(
    @CurrentUser() user: AuthUser,
    @Query("osNumero") osNumero?: string,
    @Query("equipamentoTag") equipamentoTag?: string,
  ) {
    return this.estoque.custos(user, {
      osNumero: osNumero ? Number(osNumero) : undefined,
      equipamentoTag,
    });
  }

  @Get("export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async export(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const csv = await this.estoque.exportCsv(user);
    res.setHeader("Content-Disposition", 'attachment; filename="estoque.csv"');
    res.send(csv);
  }

  @RequirePermission("estoque", PERMISSAO_NIVEL.EDICAO)
  @Post("itens")
  create(@CurrentUser() user: AuthUser, @Body() body: CreateItemDto) {
    return this.estoque.create(user, body);
  }

  @RequirePermission("estoque", PERMISSAO_NIVEL.EDICAO)
  @Patch("itens/:codigo")
  patch(@CurrentUser() user: AuthUser, @Param("codigo") codigo: string, @Body() body: PatchItemDto) {
    if (body.ativo === false || body.ativo === true) {
      return this.estoque.setAtivo(user, codigo, body.ativo, body.motivoInativacao);
    }
    return this.estoque.updateCatalogo(user, codigo, body);
  }

  @RequirePermission("estoque", PERMISSAO_NIVEL.EDICAO)
  @Post("entradas")
  entrada(@CurrentUser() user: AuthUser, @Body() body: EntradaDto) {
    return this.estoque.entrada(user, body);
  }

  @RequirePermission("estoque", PERMISSAO_NIVEL.EDICAO)
  @Post("baixas")
  baixar(@CurrentUser() user: AuthUser, @Body() body: BaixaDto) {
    return this.estoque.baixar(user, body.itemCodigo, body.qtd, body.osNumero, {
      chaveIdempotencia: body.chaveIdempotencia,
      documento: body.documento,
    });
  }

  @RequirePermission("estoque", PERMISSAO_NIVEL.EDICAO)
  @Post("reservas")
  reservar(@CurrentUser() user: AuthUser, @Body() body: ReservaDto) {
    return this.estoque.reservar(user, body.itemCodigo, body.qtd, body.osNumero);
  }

  @RequirePermission("estoque", PERMISSAO_NIVEL.EDICAO)
  @Post("reposicoes")
  reposicao(@CurrentUser() user: AuthUser, @Body() body: ReposicaoDto) {
    return this.estoque.solicitarRepos(user, body.itemCodigo, body.qtd, body.observacao);
  }

  @RequirePermission("estoque", PERMISSAO_NIVEL.EDICAO)
  @Post("ajustes")
  ajuste(@CurrentUser() user: AuthUser, @Body() body: AjusteDto) {
    return this.estoque.ajuste(user, body);
  }

  @RequirePermission("estoque", PERMISSAO_NIVEL.EDICAO)
  @Post("devolucoes")
  devolucao(@CurrentUser() user: AuthUser, @Body() body: DevolucaoDto) {
    return this.estoque.devolucao(user, body.movimentoId, body.qtd, body.motivo);
  }

  @RequirePermission("estoque", PERMISSAO_NIVEL.EDICAO)
  @Post("estornos")
  estorno(@CurrentUser() user: AuthUser, @Body() body: EstornoDto) {
    return this.estoque.estorno(user, body.movimentoId, body.motivo);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post("os/:numero/custos")
  custoOs(@CurrentUser() user: AuthUser, @Param("numero") numero: string, @Body() body: CustoOsDto) {
    return this.estoque.lancarCustoOs(user, Number(numero), body);
  }

  @Get("componentes-recuperados")
  componentes(@CurrentUser() user: AuthUser) {
    return this.estoque.listComponentes(user.estabelecimentoId);
  }

  @RequirePermission("estoque", PERMISSAO_NIVEL.EDICAO)
  @Post("componentes-recuperados")
  createComp(@CurrentUser() user: AuthUser, @Body() body: CreateCompDto) {
    return this.estoque.createComponente(user, body);
  }

  @RequirePermission("estoque", PERMISSAO_NIVEL.EDICAO)
  @Patch("componentes-recuperados/:id")
  updateComp(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: UpdateCompDto,
  ) {
    return this.estoque.updateComponente(user, id, body);
  }
}
