import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CondicaoUsoEquipamento,
  DecisaoOrcamento,
  ModoDecisaoOrcamento,
  Prisma,
  StatusAtendimentoExterno,
  StatusOS,
  TipoMovimentacaoEquipamento,
  VisibilidadeOs,
} from "@prisma/client";
import {
  PERMISSAO_NIVEL,
  custosEncaminhamento,
  localizacaoDuranteAssistencia,
  podeAbrirEncaminhamento,
  podeAtribuirOS,
  podeAlterarStatusOS,
  temPermissao,
  transicaoAtendimentoExterno,
  validarDecisaoOrcamento,
  type AcaoAtendimentoExterno,
  type StatusAtendimentoExterno as StatusAtend,
} from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";
import { parseAnexoDataUrl } from "../os/os-anexos";

const ORC_SELECT = {
  id: true,
  versao: true,
  valor: true,
  descricao: true,
  decisao: true,
  modoDecisao: true,
  decisaoEm: true,
  responsavelExterno: true,
  dataAutorizacaoExterna: true,
  autorizacaoExternaObs: true,
  nomeArquivo: true,
  mimeType: true,
  createdAt: true,
  decisaoPor: { select: { nome: true } },
} as const;

const DOC_SELECT = {
  id: true,
  tipo: true,
  nomeArquivo: true,
  mimeType: true,
  descricao: true,
  createdAt: true,
} as const;

@Injectable()
export class AtendimentoExternoService {
  constructor(private readonly prisma: PrismaService) {}

  private assertOsEdit(user: AuthUser) {
    if (!podeAtribuirOS(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException("Sem permissão para operar atendimento externo");
    }
  }

  private includeDetalhe() {
    return {
      fornecedor: { select: { id: true, nome: true, telefone: true, email: true } },
      contrato: {
        select: {
          id: true,
          numero: true,
          descricao: true,
          tipo: true,
          vigenciaFim: true,
          cobrePecas: true,
          cobreServicos: true,
          escopo: true,
          exclusoes: true,
        },
      },
      equipamento: {
        select: {
          id: true,
          tag: true,
          nome: true,
          nSerie: true,
          patrimonio: true,
          condicaoUso: true,
          localizacaoFisica: true,
          garantiaInicio: true,
          garantiaFim: true,
          setor: { select: { id: true, nome: true } },
        },
      },
      ordemServico: { select: { id: true, numero: true, codigo: true, status: true, pendencia: true } },
      orcamentos: { orderBy: { versao: "asc" as const }, select: ORC_SELECT },
      documentos: { orderBy: { createdAt: "desc" as const }, select: DOC_SELECT },
      eventos: {
        orderBy: { createdAt: "desc" as const },
        take: 40,
        include: { usuario: { select: { nome: true } } },
      },
      conferenciaPor: { select: { nome: true } },
    };
  }

  private decorate<T extends {
    status: StatusAtendimentoExterno;
    orcamentos: Array<{ versao: number; valor: unknown; decisao: DecisaoOrcamento }>;
    custoRealizado: unknown;
    custoInformado: unknown;
    custoAprovado: unknown;
    equipamento?: { garantiaFim: Date | null; garantiaInicio: Date | null } | null;
    contrato?: { tipo: string; numero: string; vigenciaFim: Date } | null;
  }>(row: T) {
    const custos = custosEncaminhamento(
      row.orcamentos.map((o) => ({
        versao: o.versao,
        valor: Number(o.valor),
        decisao: o.decisao,
      })),
      row.custoRealizado == null ? null : Number(row.custoRealizado),
    );
    const garantiaFim = row.equipamento?.garantiaFim ?? null;
    const garantiaVigente = Boolean(garantiaFim && garantiaFim.getTime() >= Date.now());
    return {
      ...row,
      custos: {
        informado: custos.informado,
        aprovado: custos.aprovado,
        realizado: custos.realizado,
      },
      cobertura: {
        garantiaAquisicao: {
          vigente: garantiaVigente,
          inicio: row.equipamento?.garantiaInicio ?? null,
          fim: garantiaFim,
          fonte: "GARANTIA_AQUISICAO" as const,
        },
        contratoManutencao: row.contrato
          ? {
              numero: row.contrato.numero,
              tipo: row.contrato.tipo,
              vigenciaFim: row.contrato.vigenciaFim,
              vigente: row.contrato.vigenciaFim.getTime() >= Date.now(),
              fonte: "CONTRATO_MANUTENCAO" as const,
            }
          : null,
      },
    };
  }

  async listPendencias(user: AuthUser) {
    if (!temPermissao(user.permissoesModulos, "os", PERMISSAO_NIVEL.LEITURA)) {
      throw new ForbiddenException();
    }
    const rows = await this.prisma.atendimentoExterno.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        OR: [{ foraDoHospital: true }, { pendenciaRetorno: true }],
      },
      orderBy: [{ previsaoRetorno: "asc" }, { createdAt: "desc" }],
      include: this.includeDetalhe(),
    });
    return rows.map((r) => this.decorate(r));
  }

  async getByOs(user: AuthUser, numero: number) {
    const os = await this.prisma.ordemServico.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId: user.estabelecimentoId, numero } },
    });
    if (!os) throw new NotFoundException(`OS ${numero} não encontrada`);
    const rows = await this.prisma.atendimentoExterno.findMany({
      where: { ordemServicoId: os.id },
      orderBy: { createdAt: "desc" },
      include: this.includeDetalhe(),
    });
    return rows.map((r) => this.decorate(r));
  }

  async get(user: AuthUser, id: string) {
    const row = await this.prisma.atendimentoExterno.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
      include: this.includeDetalhe(),
    });
    if (!row) throw new NotFoundException();
    return this.decorate(row);
  }

  async abrir(
    user: AuthUser,
    numero: number,
    data: { fornecedorId: string; contratoId?: string; observacoes?: string },
  ) {
    this.assertOsEdit(user);
    const os = await this.prisma.ordemServico.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId: user.estabelecimentoId, numero } },
      include: { equipamento: true },
    });
    if (!os) throw new NotFoundException(`OS ${numero} não encontrada`);
    if (!os.equipamentoId || !os.equipamento) {
      throw new BadRequestException("Identifique o equipamento na OS antes do encaminhamento");
    }
    if (os.status === StatusOS.CONCLUIDA || os.status === StatusOS.CANCELADA) {
      throw new ConflictException("Não encaminhe OS encerrada — reabra ou use a OS em curso");
    }

    const existentes = await this.prisma.atendimentoExterno.findMany({
      where: { ordemServicoId: os.id },
      select: { status: true },
    });
    const pode = podeAbrirEncaminhamento(existentes.map((e) => e.status as StatusAtend));
    if (!pode.ok) throw new ConflictException(pode.erro);

    const forn = await this.prisma.fornecedor.findFirst({
      where: { id: data.fornecedorId, estabelecimentoId: user.estabelecimentoId, ativo: true },
    });
    if (!forn) throw new BadRequestException("Fornecedor inválido");

    let contratoId: string | null = null;
    if (data.contratoId) {
      const c = await this.prisma.contrato.findFirst({
        where: {
          id: data.contratoId,
          estabelecimentoId: user.estabelecimentoId,
          fornecedorId: forn.id,
        },
        include: { equipamentos: true },
      });
      if (!c) throw new BadRequestException("Contrato inválido para este fornecedor");
      if (c.tipo === "MANUTENCAO" && os.equipamentoId) {
        const cobre = c.equipamentos.some((e) => e.equipamentoId === os.equipamentoId);
        if (!cobre) {
          throw new BadRequestException("Este contrato de manutenção não cobre o equipamento da OS");
        }
      }
      contratoId = c.id;
    }

    const created = await this.prisma.atendimentoExterno.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        ordemServicoId: os.id,
        equipamentoId: os.equipamentoId,
        fornecedorId: forn.id,
        contratoId,
        observacoes: data.observacoes?.trim() || null,
        origemSetorId: os.equipamento.setorId,
        origemLocalizacao: os.equipamento.localizacaoFisica,
        identificacaoEquipamento: [os.equipamento.tag, os.equipamento.nSerie, os.equipamento.patrimonio]
          .filter(Boolean)
          .join(" · "),
        eventos: {
          create: {
            acao: "ABERTURA",
            detalhe: `Encaminhamento na OS ${os.codigo ?? os.numero} · ${forn.nome}`,
            usuarioId: user.userId,
          },
        },
      },
      include: this.includeDetalhe(),
    });

    await this.prisma.logOrdemServico.create({
      data: {
        ordemServicoId: os.id,
        usuarioId: user.userId,
        acao: "ENCAMINHAMENTO_EXTERNO",
        justificativa: `Aberto encaminhamento a ${forn.nome} (mesma OS, sem duplicar)`,
        visibilidade: VisibilidadeOs.INTERNO,
      },
    });

    return this.decorate(created);
  }

  private async loadAtivo(user: AuthUser, numero: number) {
    const os = await this.prisma.ordemServico.findUnique({
      where: { estabelecimentoId_numero: { estabelecimentoId: user.estabelecimentoId, numero } },
    });
    if (!os) throw new NotFoundException(`OS ${numero} não encontrada`);
    const row = await this.prisma.atendimentoExterno.findFirst({
      where: {
        ordemServicoId: os.id,
        status: { notIn: [StatusAtendimentoExterno.CANCELADO, StatusAtendimentoExterno.LIBERADO] },
      },
      include: { orcamentos: { orderBy: { versao: "asc" } }, fornecedor: true, equipamento: true },
    });
    if (!row) throw new NotFoundException("Nenhum encaminhamento ativo nesta OS");
    return { os, row };
  }

  private async persistir(
    user: AuthUser,
    rowId: string,
    acao: AcaoAtendimentoExterno,
    ctx: Parameters<typeof transicaoAtendimentoExterno>[2],
    data: Prisma.AtendimentoExternoUpdateInput,
    evento: string,
    detalhe?: string,
  ) {
    const atual = await this.prisma.atendimentoExterno.findUnique({ where: { id: rowId } });
    if (!atual) throw new NotFoundException();
    const t = transicaoAtendimentoExterno(atual.status as StatusAtend, acao, ctx);
    if (!t.ok) throw new ConflictException(t.erro);
    return this.prisma.atendimentoExterno.update({
      where: { id: rowId },
      data: {
        ...data,
        status: t.proximo as StatusAtendimentoExterno,
        eventos: { create: { acao: evento, detalhe: detalhe ?? null, usuarioId: user.userId } },
      },
      include: this.includeDetalhe(),
    });
  }

  async registrarOrcamento(
    user: AuthUser,
    numero: number,
    body: { valor: number; descricao?: string; dataUrl?: string; nomeArquivo?: string },
  ) {
    this.assertOsEdit(user);
    if (body.valor == null || Number(body.valor) < 0) throw new BadRequestException("Informe o valor do orçamento");
    const { row } = await this.loadAtivo(user, numero);
    const t = transicaoAtendimentoExterno(row.status as StatusAtend, "registrar_orcamento");
    if (!t.ok) throw new ConflictException(t.erro);

    const versao = (row.orcamentos.at(-1)?.versao ?? 0) + 1;
    let anexo: { nomeArquivo: string; mimeType: string; conteudo: Buffer } | null = null;
    if (body.dataUrl) {
      const parsed = parseAnexoDataUrl(body.dataUrl, body.nomeArquivo);
      anexo = { nomeArquivo: parsed.nomeArquivo, mimeType: parsed.mimeType, conteudo: parsed.buffer };
    }

    await this.prisma.atendimentoOrcamento.create({
      data: {
        atendimentoId: row.id,
        versao,
        valor: body.valor,
        descricao: body.descricao?.trim() || null,
        ...(anexo ?? {}),
      },
    });

    const updated = await this.prisma.atendimentoExterno.update({
      where: { id: row.id },
      data: {
        status: t.proximo as StatusAtendimentoExterno,
        custoInformado: body.valor,
        eventos: {
          create: {
            acao: "ORCAMENTO",
            detalhe: `Versão ${versao} · R$ ${Number(body.valor).toFixed(2)}`,
            usuarioId: user.userId,
          },
        },
      },
      include: this.includeDetalhe(),
    });
    return this.decorate(updated);
  }

  async decidir(
    user: AuthUser,
    numero: number,
    body: {
      versao?: number;
      decisao: "APROVADO" | "REPROVADO";
      modo: "APROVACAO_INTERNA" | "AUTORIZACAO_EXTERNA";
      responsavelExterno?: string;
      dataAutorizacaoExterna?: string;
      autorizacaoExternaObs?: string;
    },
  ) {
    this.assertOsEdit(user);
    const { row } = await this.loadAtivo(user, numero);
    const orc =
      (body.versao
        ? row.orcamentos.find((o) => o.versao === body.versao)
        : row.orcamentos.at(-1)) ?? null;
    if (!orc) throw new BadRequestException("Nenhum orçamento para decidir");

    const check = validarDecisaoOrcamento({
      modo: body.modo,
      temAprovacaoInterna: podeAlterarStatusOS(user.perfil, user.permissoesModulos),
      responsavelExterno: body.responsavelExterno,
      dataExterna: body.dataAutorizacaoExterna,
    });
    if (!check.ok) throw new ForbiddenException(check.erro);

    const t = transicaoAtendimentoExterno(row.status as StatusAtend, "decidir", {
      temOrcamento: true,
      decisao: body.decisao,
    });
    if (!t.ok) throw new ConflictException(t.erro);

    await this.prisma.atendimentoOrcamento.update({
      where: { id: orc.id },
      data: {
        decisao: body.decisao as DecisaoOrcamento,
        modoDecisao: body.modo as ModoDecisaoOrcamento,
        decisaoEm: new Date(),
        decisaoPorId: user.userId,
        responsavelExterno: body.responsavelExterno?.trim() || null,
        dataAutorizacaoExterna: body.dataAutorizacaoExterna
          ? new Date(body.dataAutorizacaoExterna)
          : null,
        autorizacaoExternaObs: body.autorizacaoExternaObs?.trim() || null,
      },
    });

    const updated = await this.prisma.atendimentoExterno.update({
      where: { id: row.id },
      data: {
        status: t.proximo as StatusAtendimentoExterno,
        custoAprovado: body.decisao === "APROVADO" ? orc.valor : null,
        eventos: {
          create: {
            acao: "DECISAO",
            detalhe: `${body.decisao} v${orc.versao} · ${body.modo === "APROVACAO_INTERNA" ? "aprovação interna" : "autorização externa"} — não enviado automaticamente ao fornecedor`,
            usuarioId: user.userId,
          },
        },
      },
      include: this.includeDetalhe(),
    });
    return this.decorate(updated);
  }

  async enviar(
    user: AuthUser,
    numero: number,
    body: {
      transporte?: string;
      acessorios?: string;
      previsaoRetorno?: string;
      identificacaoEquipamento?: string;
      dataUrl?: string;
      nomeArquivo?: string;
    },
  ) {
    this.assertOsEdit(user);
    const { os, row } = await this.loadAtivo(user, numero);
    const aprovado = [...row.orcamentos].reverse().find((o) => o.decisao === DecisaoOrcamento.APROVADO);
    const t = transicaoAtendimentoExterno(row.status as StatusAtend, "enviar", {
      decisao: aprovado ? "APROVADO" : row.orcamentos.at(-1)?.decisao,
      previsaoRetorno: Boolean(body.previsaoRetorno),
    });
    if (!t.ok) throw new ConflictException(t.erro);

    if (body.dataUrl) {
      const parsed = parseAnexoDataUrl(body.dataUrl, body.nomeArquivo);
      await this.prisma.atendimentoExternoDocumento.create({
        data: {
          atendimentoId: row.id,
          tipo: "COMPROVANTE_ENVIO",
          nomeArquivo: parsed.nomeArquivo,
          mimeType: parsed.mimeType,
          conteudo: parsed.buffer,
          descricao: "Comprovante de envio",
          usuarioId: user.userId,
        },
      });
    }

    const loc = localizacaoDuranteAssistencia(row.fornecedor.nome);
    await this.prisma.$transaction(async (tx) => {
      await tx.equipamentoMovimentacao.create({
        data: {
          equipamentoId: row.equipamentoId,
          tipo: TipoMovimentacaoEquipamento.ASSISTENCIA,
          origemSetorId: row.equipamento.setorId,
          origemLocalizacao: row.equipamento.localizacaoFisica,
          destinoLocalizacao: loc,
          data: new Date(),
          responsavelNome: user.email,
          usuarioId: user.userId,
          motivo: `Encaminhado à assistência ${row.fornecedor.nome} (OS ${os.codigo ?? os.numero})`,
        },
      });
      await tx.equipamento.update({
        where: { id: row.equipamentoId },
        data: { condicaoUso: CondicaoUsoEquipamento.PARADO, localizacaoFisica: loc },
      });
      if (os.status !== StatusOS.AGUARDANDO && os.status !== StatusOS.CONCLUIDA) {
        await tx.ordemServico.update({
          where: { id: os.id },
          data: {
            status: StatusOS.AGUARDANDO,
            motivoAguardo: `Encaminhado à assistência ${row.fornecedor.nome}`,
            logs: {
              create: {
                usuarioId: user.userId,
                acao: "AGUARDO",
                justificativa: `Equipamento enviado a ${row.fornecedor.nome}`,
                visibilidade: VisibilidadeOs.PUBLICO,
              },
            },
          },
        });
      }
    });

    const updated = await this.prisma.atendimentoExterno.update({
      where: { id: row.id },
      data: {
        status: t.proximo as StatusAtendimentoExterno,
        transporte: body.transporte?.trim() || null,
        acessorios: body.acessorios?.trim() || null,
        identificacaoEquipamento:
          body.identificacaoEquipamento?.trim() || row.identificacaoEquipamento,
        enviadoEm: new Date(),
        previsaoRetorno: body.previsaoRetorno ? new Date(body.previsaoRetorno) : row.previsaoRetorno,
        foraDoHospital: true,
        pendenciaRetorno: true,
        eventos: {
          create: {
            acao: "ENVIO",
            detalhe: `Transporte: ${body.transporte?.trim() || "—"} · acessórios: ${body.acessorios?.trim() || "—"}`,
            usuarioId: user.userId,
          },
        },
      },
      include: this.includeDetalhe(),
    });
    return this.decorate(updated);
  }

  async previsao(user: AuthUser, numero: number, previsaoRetorno: string) {
    this.assertOsEdit(user);
    if (!previsaoRetorno) throw new BadRequestException("Informe a previsão de retorno");
    const { row } = await this.loadAtivo(user, numero);
    const updated = await this.persistir(
      user,
      row.id,
      "previsao",
      {},
      { previsaoRetorno: new Date(previsaoRetorno), pendenciaRetorno: true, foraDoHospital: true },
      "PREVISAO_RETORNO",
      previsaoRetorno,
    );
    return this.decorate(updated);
  }

  async retornar(
    user: AuthUser,
    numero: number,
    body: {
      custoRealizado?: number;
      dataUrl?: string;
      nomeArquivo?: string;
      acessorios?: string;
    },
  ) {
    this.assertOsEdit(user);
    const { os, row } = await this.loadAtivo(user, numero);
    const t = transicaoAtendimentoExterno(row.status as StatusAtend, "retornar");
    if (!t.ok) throw new ConflictException(t.erro);

    if (body.dataUrl) {
      const parsed = parseAnexoDataUrl(body.dataUrl, body.nomeArquivo);
      await this.prisma.atendimentoExternoDocumento.create({
        data: {
          atendimentoId: row.id,
          tipo: "COMPROVANTE_RETORNO",
          nomeArquivo: parsed.nomeArquivo,
          mimeType: parsed.mimeType,
          conteudo: parsed.buffer,
          descricao: "Comprovante de retorno",
          usuarioId: user.userId,
        },
      });
    }

    let custoOsItemId = row.custoOsItemId;
    if (body.custoRealizado != null && body.custoRealizado >= 0 && !custoOsItemId) {
      const item = await this.prisma.ordemServicoItem.create({
        data: {
          ordemServicoId: os.id,
          tipo: "MAO_DE_OBRA",
          descricao: `Atendimento externo · ${row.fornecedor.nome}`,
          quantidade: 1,
          valorUnitario: body.custoRealizado,
        },
      });
      custoOsItemId = item.id;
    }

    const destinoSetorId = row.origemSetorId || row.equipamento.setorId;
    await this.prisma.$transaction(async (tx) => {
      await tx.equipamentoMovimentacao.create({
        data: {
          equipamentoId: row.equipamentoId,
          tipo: TipoMovimentacaoEquipamento.RETORNO,
          origemLocalizacao: row.equipamento.localizacaoFisica,
          destinoSetorId,
          destinoLocalizacao: row.origemLocalizacao,
          data: new Date(),
          responsavelNome: user.email,
          usuarioId: user.userId,
          motivo: `Retorno da assistência ${row.fornecedor.nome} — conferência técnica pendente`,
        },
      });
      await tx.equipamento.update({
        where: { id: row.equipamentoId },
        data: {
          setorId: destinoSetorId,
          localizacaoFisica: row.origemLocalizacao,
          condicaoUso: CondicaoUsoEquipamento.PARADO,
        },
      });
    });

    const updated = await this.prisma.atendimentoExterno.update({
      where: { id: row.id },
      data: {
        status: t.proximo as StatusAtendimentoExterno,
        retornadoEm: new Date(),
        foraDoHospital: false,
        pendenciaRetorno: true,
        acessorios: body.acessorios?.trim() || row.acessorios,
        custoRealizado: body.custoRealizado != null ? body.custoRealizado : row.custoRealizado,
        custoOsItemId,
        eventos: {
          create: {
            acao: "RETORNO",
            detalhe: "Equipamento no hospital — não liberar uso antes da conferência técnica",
            usuarioId: user.userId,
          },
        },
      },
      include: this.includeDetalhe(),
    });
    return this.decorate(updated);
  }

  async conferir(
    user: AuthUser,
    numero: number,
    body: {
      ok: boolean;
      condicaoFinal: CondicaoUsoEquipamento;
      observacao?: string;
      custoRealizado?: number;
    },
  ) {
    this.assertOsEdit(user);
    const { os, row } = await this.loadAtivo(user, numero);
    const t = transicaoAtendimentoExterno(row.status as StatusAtend, "conferir", {
      conferenciaOk: body.ok,
      condicaoFinal: body.condicaoFinal,
    });
    if (!t.ok) throw new ConflictException(t.erro);

    const colab = await this.prisma.colaborador.findFirst({
      where: { usuarioId: user.userId, estabelecimentoId: user.estabelecimentoId },
    });

    let custoOsItemId = row.custoOsItemId;
    if (body.custoRealizado != null && body.custoRealizado >= 0 && !custoOsItemId) {
      const item = await this.prisma.ordemServicoItem.create({
        data: {
          ordemServicoId: os.id,
          tipo: "MAO_DE_OBRA",
          descricao: `Atendimento externo · ${row.fornecedor.nome}`,
          quantidade: 1,
          valorUnitario: body.custoRealizado,
        },
      });
      custoOsItemId = item.id;
    }

    if (t.proximo === "LIBERADO") {
      await this.prisma.equipamento.update({
        where: { id: row.equipamentoId },
        data: { condicaoUso: body.condicaoFinal },
      });
    } else {
      await this.prisma.equipamento.update({
        where: { id: row.equipamentoId },
        data: {
          condicaoUso:
            body.condicaoFinal === CondicaoUsoEquipamento.APTO
              ? CondicaoUsoEquipamento.PARADO
              : body.condicaoFinal,
        },
      });
    }

    const updated = await this.prisma.atendimentoExterno.update({
      where: { id: row.id },
      data: {
        status: t.proximo as StatusAtendimentoExterno,
        conferenciaEm: new Date(),
        conferenciaPorId: user.userId,
        conferenciaColabId: colab?.id ?? null,
        conferenciaOk: body.ok,
        conferenciaObs: body.observacao?.trim() || null,
        condicaoFinal: body.condicaoFinal,
        pendenciaRetorno: t.proximo !== "LIBERADO",
        custoRealizado: body.custoRealizado != null ? body.custoRealizado : row.custoRealizado,
        custoOsItemId,
        eventos: {
          create: {
            acao: "CONFERENCIA",
            detalhe: body.ok
              ? `Aprovado · condição ${body.condicaoFinal}`
              : `Não aprovado · equipamento não liberado para uso`,
            usuarioId: user.userId,
          },
        },
      },
      include: this.includeDetalhe(),
    });

    await this.prisma.logOrdemServico.create({
      data: {
        ordemServicoId: os.id,
        usuarioId: user.userId,
        acao: "CONFERENCIA_EXTERNA",
        justificativa: updated.eventos[0]?.detalhe ?? "Conferência técnica",
        visibilidade: VisibilidadeOs.INTERNO,
      },
    });

    return this.decorate(updated);
  }

  async cancelar(user: AuthUser, numero: number, motivo: string) {
    this.assertOsEdit(user);
    if (!motivo?.trim()) throw new BadRequestException("Informe o motivo");
    const { row } = await this.loadAtivo(user, numero);
    const updated = await this.persistir(
      user,
      row.id,
      "cancelar",
      {},
      { pendenciaRetorno: false, foraDoHospital: false },
      "CANCELAMENTO",
      motivo.trim(),
    );
    return this.decorate(updated);
  }

  async addDocumento(
    user: AuthUser,
    numero: number,
    body: { tipo?: string; dataUrl: string; nomeArquivo?: string; descricao?: string },
  ) {
    this.assertOsEdit(user);
    const { row } = await this.loadAtivo(user, numero);
    const parsed = parseAnexoDataUrl(body.dataUrl, body.nomeArquivo);
    return this.prisma.atendimentoExternoDocumento.create({
      data: {
        atendimentoId: row.id,
        tipo: body.tipo?.trim() || "OUTRO",
        nomeArquivo: parsed.nomeArquivo,
        mimeType: parsed.mimeType,
        conteudo: parsed.buffer,
        descricao: body.descricao?.trim() || null,
        usuarioId: user.userId,
      },
      select: DOC_SELECT,
    });
  }

  async baixarDocumento(user: AuthUser, id: string, docId: string) {
    const doc = await this.prisma.atendimentoExternoDocumento.findFirst({
      where: {
        id: docId,
        atendimento: { id, estabelecimentoId: user.estabelecimentoId },
      },
    });
    if (!doc) throw new NotFoundException();
    return doc;
  }

  async baixarOrcamento(user: AuthUser, id: string, orcId: string) {
    const orc = await this.prisma.atendimentoOrcamento.findFirst({
      where: {
        id: orcId,
        atendimento: { id, estabelecimentoId: user.estabelecimentoId },
      },
    });
    if (!orc?.conteudo) throw new NotFoundException("Documento do orçamento não encontrado");
    return orc;
  }
}
