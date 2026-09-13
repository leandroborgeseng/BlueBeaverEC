import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, MinLength } from "class-validator";
import type { Response } from "express";
import { StatusOS, TipoLaudo, VisibilidadeOs } from "@prisma/client";
import { PERMISSAO_NIVEL, temPermissao } from "@aion/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequirePermission } from "../auth/permissions.guard";
import { CurrentUser, type AuthUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { SessionService } from "../session/session.service";
import { OsService } from "../os/os.service";

class PortalComentarioDto {
  @IsString()
  @MinLength(2)
  texto!: string;
}

class PortalAnexoDto {
  @IsString()
  dataUrl!: string;

  @IsOptional()
  @IsString()
  nomeArquivo?: string;
}

class PedidoReaberturaDto {
  @IsString()
  @MinLength(3)
  justificativa!: string;
}

@Controller("portal")
@UseGuards(JwtAuthGuard)
export class PortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly session: SessionService,
    private readonly os: OsService,
  ) {}

  @Get("cronograma-manutencao")
  cronogramaManutencao(@CurrentUser() user: AuthUser, @Query("setor") setor?: string) {
    this.assertCronograma(user);
    return this.cronograma(user, setor);
  }

  @Get("cronograma-calibracao")
  cronogramaLegacy(@CurrentUser() user: AuthUser, @Query("setor") setor?: string) {
    this.assertCronograma(user);
    return this.cronograma(user, setor);
  }

  @Get("os-abertas")
  @RequirePermission("portal", PERMISSAO_NIVEL.LEITURA)
  async osAbertas(@CurrentUser() user: AuthUser) {
    return this.minhasOs(user);
  }

  @Get("minhas-os")
  @RequirePermission("portal", PERMISSAO_NIVEL.LEITURA)
  async minhasOs(@CurrentUser() user: AuthUser) {
    const me = await this.session.me(user);
    const rows = await this.prisma.ordemServico.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        solicitacao: {
          OR: [
            { solicitanteUsuarioId: user.userId },
            { solicitanteUsuarioId: null, solicitanteNome: me.nome },
          ],
        },
      },
      include: {
        equipamento: { include: { setor: true } },
        setor: true,
        responsavel: { select: { nome: true } },
        solicitacao: { select: { protocolo: true } },
      },
      orderBy: [{ abertura: "desc" }],
      take: 80,
    });

    return rows.map((os) => {
      const setorNome = os.equipamento?.setor.nome ?? os.setor?.nome ?? "—";
      return {
        id: os.id,
        numero: os.numero,
        codigo: os.codigo,
        tipo: os.tipo,
        status: os.status,
        prioridade: os.prioridade,
        abertura: os.abertura,
        fechamento: os.fechamento,
        protocolo: os.solicitacao?.protocolo,
        responsavelNome: os.responsavel?.nome ?? null,
        textoConclusaoPublico: os.textoConclusaoPublico,
        pedidoReaberturaEm: os.pedidoReaberturaEm,
        equipamento: {
          tag: os.equipamento?.tag ?? "—",
          nome: os.equipamento?.nome ?? (os.setor?.nome ? `Chamado · ${os.setor.nome}` : "Chamado do setor"),
          setor: setorNome,
        },
      };
    });
  }

  @Get("equipamentos")
  @RequirePermission("portal", PERMISSAO_NIVEL.LEITURA)
  async buscarEquipamentos(@CurrentUser() user: AuthUser, @Query("q") q?: string) {
    const me = await this.session.me(user);
    const setorFilter = await this.resolveSetorFilter(user, me.setorIds);
    const termo = q?.trim();
    if (!termo || termo.length < 2) return [];
    return this.prisma.equipamento.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        ...(setorFilter ? { setorId: { in: setorFilter } } : {}),
        OR: [
          { tag: { contains: termo, mode: "insensitive" } },
          { nome: { contains: termo, mode: "insensitive" } },
          { patrimonio: { contains: termo, mode: "insensitive" } },
          { nSerie: { contains: termo, mode: "insensitive" } },
        ],
      },
      select: {
        tag: true,
        nome: true,
        patrimonio: true,
        nSerie: true,
        setor: { select: { nome: true } },
      },
      take: 20,
      orderBy: { tag: "asc" },
    });
  }

  @Get("os/:numero")
  @RequirePermission("portal", PERMISSAO_NIVEL.LEITURA)
  async detalheOs(@CurrentUser() user: AuthUser, @Param("numero") numero: string) {
    const os = await this.os.getByNumero(user.estabelecimentoId, Number(numero), user.perfil);
    await this.os.assertPodeVerComoSolicitante(user, os);
    return {
      numero: os.numero,
      codigo: os.codigo,
      status: os.status,
      prioridade: os.prioridade,
      abertura: os.abertura,
      fechamento: os.fechamento,
      protocolo: os.solicitacao?.protocolo,
      descricao: os.solicitacao?.descricao ?? os.observacaoRequisicao,
      responsavelNome: os.responsavel?.nome ?? null,
      setorNome: os.equipamento?.setor?.nome ?? os.setor?.nome ?? null,
      equipamento: os.equipamento
        ? { tag: os.equipamento.tag, nome: os.equipamento.nome }
        : null,
      identificacaoPendente: os.identificacaoPendente,
      equipamentoParado: os.equipamentoParado,
      textoConclusaoPublico: os.textoConclusaoPublico,
      pedidoReaberturaEm: os.pedidoReaberturaEm,
      pedidoReaberturaJustificativa: os.pedidoReaberturaJustificativa,
      timeline: os.timeline,
      anexos: os.anexos,
    };
  }

  @Post("os/:numero/comentarios")
  @RequirePermission("portal", PERMISSAO_NIVEL.EDICAO)
  async comentar(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: PortalComentarioDto,
  ) {
    const os = await this.os.getByNumero(user.estabelecimentoId, Number(numero), user.perfil);
    await this.os.assertPodeVerComoSolicitante(user, os);
    return this.os.comentar(user, Number(numero), body.texto, VisibilidadeOs.PUBLICO);
  }

  @Post("os/:numero/anexos")
  @RequirePermission("portal", PERMISSAO_NIVEL.EDICAO)
  async anexar(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: PortalAnexoDto,
  ) {
    const os = await this.os.getByNumero(user.estabelecimentoId, Number(numero), user.perfil);
    await this.os.assertPodeVerComoSolicitante(user, os);
    return this.os.anexar(user, Number(numero), {
      dataUrl: body.dataUrl,
      nomeArquivo: body.nomeArquivo,
      visibilidade: VisibilidadeOs.PUBLICO,
    });
  }

  @Get("os/:numero/anexos/:anexoId")
  @RequirePermission("portal", PERMISSAO_NIVEL.LEITURA)
  async baixarAnexo(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Param("anexoId") anexoId: string,
    @Res() res: Response,
  ) {
    const os = await this.os.getByNumero(user.estabelecimentoId, Number(numero), user.perfil);
    await this.os.assertPodeVerComoSolicitante(user, os);
    const anexo = await this.os.baixarAnexo(user, Number(numero), anexoId);
    res.setHeader("Content-Type", anexo.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${anexo.nomeArquivo.replace(/"/g, "")}"`,
    );
    res.send(Buffer.from(anexo.conteudo));
  }

  @Post("os/:numero/pedir-reabertura")
  @RequirePermission("portal", PERMISSAO_NIVEL.EDICAO)
  async pedirReabertura(
    @CurrentUser() user: AuthUser,
    @Param("numero") numero: string,
    @Body() body: PedidoReaberturaDto,
  ) {
    return this.os.pedirReabertura(user, Number(numero), body.justificativa);
  }

  @Get("inventario-setor")
  @RequirePermission("portal", PERMISSAO_NIVEL.LEITURA)
  async inventario(@CurrentUser() user: AuthUser, @Query("setor") setor?: string) {
    const me = await this.session.me(user);
    const setorFilter = await this.resolveSetorFilter(user, me.setorIds, setor);

    const items = await this.prisma.equipamento.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        ...(setorFilter ? { setorId: { in: setorFilter } } : {}),
      },
      include: {
        setor: true,
        fabricante: true,
        modelo: true,
        descricao: true,
      },
      orderBy: { tag: "asc" },
      take: 200,
    });

    return items.map((e) => ({
      tag: e.tag,
      nome: e.nome,
      situacao: e.situacao,
      setor: e.setor.nome,
      fabricante: e.fabricante.nome,
      modelo: e.modelo.nome,
      tipo: e.descricao.nome,
      criticidade: e.descricao.criticidade,
    }));
  }

  @Get("equipamento/:tag")
  @RequirePermission("portal", PERMISSAO_NIVEL.LEITURA)
  async equipamento(@CurrentUser() user: AuthUser, @Param("tag") tag: string) {
    const me = await this.session.me(user);
    const setorFilter = await this.resolveSetorFilter(user, me.setorIds);
    const code = tag.trim();
    const eq = await this.prisma.equipamento.findFirst({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        tag: { equals: code, mode: "insensitive" },
        ...(setorFilter ? { setorId: { in: setorFilter } } : {}),
      },
      include: {
        setor: true,
        fabricante: true,
        modelo: true,
      },
    });
    if (!eq) throw new NotFoundException("Equipamento não encontrado no seu setor");

    const osAbertas = await this.prisma.ordemServico.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        equipamentoId: eq.id,
        status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO, StatusOS.AGUARDANDO] },
      },
      orderBy: { abertura: "desc" },
      take: 20,
    });

    return {
      equipamento: {
        tag: eq.tag,
        nome: eq.nome,
        situacao: eq.situacao,
        patrimonio: eq.patrimonio,
        setor: eq.setor,
        fabricante: eq.fabricante,
        modelo: eq.modelo,
      },
      osAbertas: osAbertas.map((o) => ({
        numero: o.numero,
        codigo: o.codigo,
        status: o.status,
        prioridade: o.prioridade,
      })),
    };
  }

  private async cronograma(user: AuthUser, setor?: string) {
    const me = await this.session.me(user);
    const setorFilter = await this.resolveSetorFilter(user, me.setorIds, setor);

    const laudos = await this.prisma.laudo.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        tipo: { in: [TipoLaudo.CALIBRACAO, TipoLaudo.TSE, TipoLaudo.PREVENTIVA, TipoLaudo.QUALIFICACAO] },
        ...(setorFilter ? { equipamento: { setorId: { in: setorFilter } } } : {}),
      },
      include: {
        equipamento: { include: { setor: true } },
      },
      orderBy: { validadeAte: "asc" },
      take: 100,
    });

    return laudos.map((l) => ({
      id: l.id,
      tipo: l.tipo,
      validadeAte: l.validadeAte,
      equipamento: {
        tag: l.equipamento.tag,
        nome: l.equipamento.nome,
        setor: l.equipamento.setor.nome,
      },
      status:
        !l.validadeAte
          ? "SEM_VALIDADE"
          : l.validadeAte.getTime() < Date.now()
            ? "VENCIDO"
            : (l.validadeAte.getTime() - Date.now()) / (1000 * 60 * 60 * 24) <= 60
              ? "A_VENCER"
              : "VALIDO",
    }));
  }

  private assertCronograma(user: AuthUser) {
    const podePortal = temPermissao(user.permissoesModulos, "portal", PERMISSAO_NIVEL.LEITURA);
    const podeOs = temPermissao(user.permissoesModulos, "os", PERMISSAO_NIVEL.LEITURA);
    if (!podePortal && !podeOs) {
      throw new ForbiddenException("Sem permissão para o cronograma de manutenção");
    }
  }

  /** Solicitante só vê o próprio setor. Sem vínculo → lista vazia. Demais perfis sem setor veem o hospital. */
  private async resolveSetorFilter(user: AuthUser, setorIds: string[], setorNome?: string) {
    const bound = setorIds?.filter(Boolean) ?? [];
    const soSetor = user.perfil === "SOLICITANTE";

    if (setorNome?.trim()) {
      const s = await this.prisma.setor.findFirst({
        where: {
          estabelecimentoId: user.estabelecimentoId,
          nome: { contains: setorNome.trim(), mode: "insensitive" },
        },
      });
      if (!s) return ["__none__"];
      if (soSetor && !bound.includes(s.id)) return ["__none__"];
      if (bound.length && !bound.includes(s.id)) return ["__none__"];
      return [s.id];
    }
    if (bound.length) return bound;
    if (soSetor) return ["__none__"];
    return null;
  }
}
