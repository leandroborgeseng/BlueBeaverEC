import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
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
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { CondicaoUsoEquipamento, PrioridadeOS, StatusOS, TipoOS, VisibilidadeOs } from "@prisma/client";
import { PERMISSAO_NIVEL } from "@aion/shared";
import { ACOES_STATUS } from "./os-transicoes";
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
  @IsString()
  resultadoAtendimento?: string;

  @IsOptional()
  @IsEnum(CondicaoUsoEquipamento)
  condicaoFinal?: CondicaoUsoEquipamento;

  @IsOptional()
  @IsBoolean()
  fechar?: boolean;
}

class StatusDto {
  @IsIn(ACOES_STATUS)
  acao!: (typeof ACOES_STATUS)[number];

  @IsOptional()
  @IsString()
  justificativa?: string;

  @IsOptional()
  @IsString()
  servicoRealizado?: string;

  @IsOptional()
  @IsString()
  resultadoAtendimento?: string;

  @IsOptional()
  @IsEnum(CondicaoUsoEquipamento)
  condicaoFinal?: CondicaoUsoEquipamento;

  @IsOptional()
  @IsString()
  textoConclusaoPublico?: string;

  @IsOptional()
  @IsString()
  diagnostico?: string;

  @IsOptional()
  @IsIn(["ESTOQUE", "PERDA", "USO_CONFIRMADO", "OUTRO"])
  destinoFisico?: "ESTOQUE" | "PERDA" | "USO_CONFIRMADO" | "OUTRO";
}

class AtribuirDto {
  @IsString()
  responsavelId!: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  expectedResponsavelId?: string | null;

  @IsOptional()
  @IsNumber()
  expectedVersao?: number;
}

class AssumirDto {
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  expectedResponsavelId?: string | null;

  @IsOptional()
  @IsNumber()
  expectedVersao?: number;
}

class ComentarioDto {
  @IsString()
  texto!: string;

  @IsOptional()
  @IsEnum(VisibilidadeOs)
  visibilidade?: VisibilidadeOs;
}

class AnexoDto {
  @IsString()
  dataUrl!: string;

  @IsOptional()
  @IsString()
  nomeArquivo?: string;

  @IsOptional()
  @IsEnum(VisibilidadeOs)
  visibilidade?: VisibilidadeOs;
}

class ExecucaoDto {
  @IsOptional()
  @IsString()
  diagnostico?: string;

  @IsOptional()
  @IsString()
  servicoRealizado?: string;

  @IsOptional()
  @IsString()
  resultadoAtendimento?: string;

  @IsOptional()
  @IsString()
  pendencia?: string | null;

  @IsOptional()
  @IsArray()
  itens?: Array<{
    tipo?: "MATERIAL" | "MAO_DE_OBRA" | "SERVICO_EXTERNO" | "OUTROS_DIRETOS";
    descricao: string;
    quantidade?: number;
    valorUnitario?: number;
    origemMaterial?: "ESTOQUE" | "COMPRA_DIRETA";
    naturezaCusto?: "ESTIMADO" | "APROVADO" | "REALIZADO";
    itemCodigo?: string;
  }>;
}

class VincularEquipamentoOsDto {
  @IsOptional()
  @IsString()
  equipamentoTag?: string;

  @IsOptional()
  @IsString()
  setorId?: string;

  @IsOptional()
  @IsString()
  setorNome?: string;

  @IsOptional()
  @IsEnum(PrioridadeOS)
  prioridade?: PrioridadeOS;
}

@Controller("os")
@UseGuards(JwtAuthGuard)
@RequirePermission("os", PERMISSAO_NIVEL.LEITURA)
export class OsController {
  constructor(private readonly os: OsService) {}

  @Get("quadro-processos")
  async quadro(@CurrentUser() user: AuthUser) {
    const pageSize = 100;
    const [naoAtrib, abertas, andamento, aguardando, concluidas, canceladas] = await Promise.all([
      this.os.list(user.estabelecimentoId, { situacao: StatusOS.NAO_ATRIBUIDA, page: 1, pageSize }),
      this.os.list(user.estabelecimentoId, { situacao: StatusOS.ABERTA, page: 1, pageSize }),
      this.os.list(user.estabelecimentoId, { situacao: StatusOS.EM_ANDAMENTO, page: 1, pageSize }),
      this.os.list(user.estabelecimentoId, { situacao: StatusOS.AGUARDANDO, page: 1, pageSize }),
      this.os.list(user.estabelecimentoId, { situacao: StatusOS.CONCLUIDA, page: 1, pageSize }),
      this.os.list(user.estabelecimentoId, { situacao: StatusOS.CANCELADA, page: 1, pageSize }),
    ]);
    return {
      NAO_ATRIBUIDA: naoAtrib.items,
      ABERTA: abertas.items,
      EM_ANDAMENTO: andamento.items,
      AGUARDANDO: aguardando.items,
      CONCLUIDA: concluidas.items,
      CANCELADA: canceladas.items,
      meta: {
        pageSize,
        truncated: {
          NAO_ATRIBUIDA: naoAtrib.total > pageSize,
          ABERTA: abertas.total > pageSize,
          EM_ANDAMENTO: andamento.total > pageSize,
          AGUARDANDO: aguardando.total > pageSize,
          CONCLUIDA: concluidas.total > pageSize,
          CANCELADA: canceladas.total > pageSize,
        },
        totals: {
          NAO_ATRIBUIDA: naoAtrib.total,
          ABERTA: abertas.total,
          EM_ANDAMENTO: andamento.total,
          AGUARDANDO: aguardando.total,
          CONCLUIDA: concluidas.total,
          CANCELADA: canceladas.total,
        },
      },
    };
  }

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query("situacao") situacao?: StatusOS,
    @Query("prioridade") prioridade?: PrioridadeOS,
    @Query("q") q?: string,
    @Query("setor") setor?: string,
    @Query("oficina") oficina?: string,
    @Query("atrasada") atrasada?: string,
    @Query("responsavelId") responsavelId?: string,
    @Query("equipamento") equipamento?: string,
    @Query("de") de?: string,
    @Query("ate") ate?: string,
    @Query("fila") fila?: "nao-atribuidas" | "minhas" | "do-outro" | "em-atendimento" | "aguardando",
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const colab = await this.os.colaboradorDoUsuario(user);
    return this.os.list(user.estabelecimentoId, {
      situacao,
      prioridade,
      q,
      setor,
      oficina,
      atrasada: atrasada === "1" || atrasada === "true" ? true : undefined,
      responsavelId,
      equipamento,
      de,
      ate,
      fila,
      colaboradorId: colab?.id,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 20,
    });
  }

  @Get("area")
  async area(@CurrentUser() user: AuthUser) {
    const colab = await this.os.colaboradorDoUsuario(user);
    return this.os.areaContagens(user.estabelecimentoId, colab?.id);
  }

  @Get("nao-atribuidas")
  naoAtribuidas(@CurrentUser() user: AuthUser) {
    return this.os.naoAtribuidas(user.estabelecimentoId);
  }

  @Get("responsaveis")
  responsaveis(@CurrentUser() user: AuthUser) {
    return this.os.responsaveis(user);
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
    return this.os.getByNumero(user.estabelecimentoId, Number(numero), user.perfil);
  }

  @Get(":numero/log")
  log(@CurrentUser() user: AuthUser, @Param("numero") numero: string) {
    return this.os.log(user.estabelecimentoId, Number(numero), user.perfil);
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

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO_APROVACAO)
  @Post("compactar-numeros")
  compactarNumeros(@CurrentUser() user: AuthUser) {
    return this.os.compactarNumeros(user);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Patch(":numero/atribuir")
  atribuir(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: AtribuirDto,
  ) {
    return this.os.atribuir(user, Number(numero), {
      responsavelId: body.responsavelId,
      expectedResponsavelId: body.expectedResponsavelId,
      expectedVersao: body.expectedVersao,
    });
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Patch(":numero/assumir")
  assumir(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: AssumirDto,
  ) {
    return this.os.assumir(user, Number(numero), body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post(":numero/comentarios")
  comentar(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: ComentarioDto,
  ) {
    return this.os.comentar(user, Number(numero), body.texto, body.visibilidade);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Post(":numero/anexos")
  anexar(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: AnexoDto,
  ) {
    return this.os.anexar(user, Number(numero), body);
  }

  @Get(":numero/anexos/:anexoId")
  async baixarAnexo(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Param("anexoId") anexoId: string,
    @Res() res: Response,
  ) {
    const anexo = await this.os.baixarAnexo(user, Number(numero), anexoId);
    res.setHeader("Content-Type", anexo.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${anexo.nomeArquivo.replace(/"/g, "")}"`,
    );
    res.send(Buffer.from(anexo.conteudo));
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Patch(":numero/equipamento")
  vincularEquipamento(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: VincularEquipamentoOsDto,
  ) {
    return this.os.triar(user, Number(numero), body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Patch(":numero/triagem")
  triagem(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: VincularEquipamentoOsDto,
  ) {
    return this.os.triar(user, Number(numero), body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO)
  @Patch(":numero/execucao")
  execucao(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: ExecucaoDto,
  ) {
    return this.os.atualizarExecucao(user, Number(numero), body);
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
    return this.os.changeStatus(user, Number(numero), body.acao, body);
  }

  @RequirePermission("os", PERMISSAO_NIVEL.EDICAO_APROVACAO)
  @Delete(":numero")
  remover(@CurrentUser() user: AuthUser, @Param("numero") numero: string) {
    return this.os.removerTesteAnaCarlos(user, Number(numero));
  }
}
