import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CondicaoUsoEquipamento,
  Criticidade,
  EventoCicloVida,
  Prisma,
  PropriedadeEquipamento,
  SituacaoEquipamento,
  TipoDocumentoEquipamento,
  TipoMovimentacaoEquipamento,
} from "@prisma/client";
import { STATUS_OS_ATIVAS, podeEditarCadastros, podeEditarModulo } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";
import { parseAnexoDataUrl } from "../os/os-anexos";
import {
  COLUNAS_IMPORT,
  extrairCodigoQr,
  garantiaVigente,
  normalizarIdent,
  payloadQrAutenticado,
  proximaTagHef,
  serieContaComoDuplicata,
  validarLoteImportacao,
  type ImportRowIn,
  type IndiceExistentes,
} from "./equipamento-regras";
import { qrSvg } from "./qr-svg";
import { sincronizarInstanciasCatalogo } from "../planos/plano-ocorrencia";

const INCLUDE_FICHA = {
  setor: true,
  fabricante: true,
  modelo: true,
  descricao: true,
  fornecedor: true,
  centroCusto: true,
  criticidadeResponsavel: { select: { id: true, nome: true } },
  historicoTags: { orderBy: { createdAt: "desc" as const }, take: 20 },
  tipoEquipamentoPlano: {
    include: {
      testes: {
        where: { ativo: true },
        orderBy: { tipoTeste: "asc" as const },
        select: {
          tipoTeste: true,
          procedimentoCodigo: true,
          periodicidadeMeses: true,
          ativo: true,
        },
      },
    },
  },
} satisfies Prisma.EquipamentoInclude;

export type CreateEquipamentoInput = {
  tag?: string;
  nome: string;
  descricaoId?: string;
  fabricanteId?: string;
  modeloId?: string;
  setorId: string;
  fornecedorId?: string;
  centroCustoId?: string;
  patrimonio?: string;
  nSerie?: string;
  idInterna?: string;
  unidade?: string;
  localizacaoFisica?: string;
  propriedade?: PropriedadeEquipamento;
  propriedadeOutra?: string;
  dataAquisicao?: string;
  dataInstalacao?: string;
  valorAquisicao?: number;
  garantiaInicio?: string;
  garantiaFim?: string;
  registroAnvisa?: string;
  validadeAnvisa?: string;
  observacao?: string;
  situacao?: SituacaoEquipamento;
  condicaoUso?: CondicaoUsoEquipamento;
  criticidadeEquipamento?: Criticidade;
  criticidadeJustificativa?: string;
  criticidadeResponsavelId?: string;
};

export type UpdateEquipamentoInput = {
  nome?: string;
  setorId?: string;
  fabricanteId?: string;
  modeloId?: string;
  fornecedorId?: string | null;
  centroCustoId?: string | null;
  patrimonio?: string | null;
  nSerie?: string | null;
  idInterna?: string | null;
  unidade?: string | null;
  localizacaoFisica?: string | null;
  propriedade?: PropriedadeEquipamento;
  propriedadeOutra?: string | null;
  observacao?: string;
  situacao?: SituacaoEquipamento;
  condicaoUso?: CondicaoUsoEquipamento;
  valorAquisicao?: number;
  valorSubstituicao?: number;
  dataAquisicao?: string | null;
  dataInstalacao?: string | null;
  garantiaInicio?: string | null;
  garantiaFim?: string | null;
  checklistRecebimentoPendente?: boolean;
  registroAnvisa?: string;
  validadeAnvisa?: string | null;
  dataEndOfService?: string | null;
  dataEndOfLife?: string | null;
  tipoEquipamentoPlanoId?: string | null;
  criticidadeEquipamento?: Criticidade | null;
  criticidadeJustificativa?: string | null;
  criticidadeResponsavelId?: string | null;
};

@Injectable()
export class EquipamentosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    estabelecimentoId: string,
    query: {
      setor?: string;
      fabricante?: string;
      modelo?: string;
      situacao?: SituacaoEquipamento;
      q?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const termo = query.q?.trim();
    const where: Prisma.EquipamentoWhereInput = {
      estabelecimentoId,
      ...(query.setor ? { setorId: query.setor } : {}),
      ...(query.fabricante ? { fabricanteId: query.fabricante } : {}),
      ...(query.modelo ? { modeloId: query.modelo } : {}),
      ...(query.situacao ? { situacao: query.situacao } : {}),
      ...(termo
        ? {
            OR: [
              { tag: { contains: termo, mode: "insensitive" } },
              { nome: { contains: termo, mode: "insensitive" } },
              { patrimonio: { contains: termo, mode: "insensitive" } },
              { nSerie: { contains: termo, mode: "insensitive" } },
              { idInterna: { contains: termo, mode: "insensitive" } },
              { fabricante: { nome: { contains: termo, mode: "insensitive" } } },
              { modelo: { nome: { contains: termo, mode: "insensitive" } } },
              { setor: { nome: { contains: termo, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.equipamento.count({ where }),
      this.prisma.equipamento.findMany({
        where,
        include: {
          setor: true,
          fabricante: true,
          modelo: true,
          descricao: true,
          tipoEquipamentoPlano: { select: { id: true, nome: true } },
        },
        orderBy: { tag: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { total, page, pageSize, items };
  }

  async inventarioAtual(estabelecimentoId: string) {
    const items = await this.prisma.equipamento.findMany({
      where: {
        estabelecimentoId,
        situacao: { not: SituacaoEquipamento.ARQUIVADO },
      },
      include: {
        setor: { select: { nome: true } },
        fabricante: { select: { nome: true } },
        modelo: { select: { nome: true } },
        descricao: { select: { nome: true, criticidade: true } },
        tipoEquipamentoPlano: { select: { nome: true } },
      },
      orderBy: [{ setor: { nome: "asc" } }, { tag: "asc" }],
    });

    const linhas = items.map((eq) => ({
      tag: eq.tag,
      nome: eq.nome,
      situacao: eq.situacao,
      condicaoUso: eq.condicaoUso,
      setor: eq.setor.nome,
      fabricante: eq.fabricante.nome,
      modelo: eq.modelo.nome,
      descricao: eq.descricao.nome,
      criticidade: eq.criticidadeEquipamento ?? eq.descricao.criticidade,
      patrimonio: eq.patrimonio ?? "",
      nSerie: eq.nSerie ?? "",
      registroAnvisa: eq.registroAnvisa ?? "",
      plano: eq.tipoEquipamentoPlano?.nome ?? "",
      dataAquisicao: eq.dataAquisicao ? eq.dataAquisicao.toISOString().slice(0, 10) : "",
      dataInstalacao: eq.dataInstalacao ? eq.dataInstalacao.toISOString().slice(0, 10) : "",
    }));

    const porSituacao: Record<string, number> = {};
    const porSetor: Record<string, number> = {};
    const porCriticidade: Record<string, number> = {};
    for (const l of linhas) {
      porSituacao[l.situacao] = (porSituacao[l.situacao] ?? 0) + 1;
      porSetor[l.setor] = (porSetor[l.setor] ?? 0) + 1;
      porCriticidade[l.criticidade] = (porCriticidade[l.criticidade] ?? 0) + 1;
    }

    return {
      total: linhas.length,
      porSituacao,
      porSetor,
      porCriticidade,
      itens: linhas,
    };
  }

  private ocultarValores<T extends { valorAquisicao?: unknown; valorSubstituicao?: unknown }>(
    eq: T,
    verValores: boolean,
  ) {
    if (verValores) return eq;
    return { ...eq, valorAquisicao: null, valorSubstituicao: null };
  }

  async byTag(estabelecimentoId: string, tag: string, verValores: boolean) {
    const eq = await this.prisma.equipamento.findUnique({
      where: { estabelecimentoId_tag: { estabelecimentoId, tag } },
      include: INCLUDE_FICHA,
    });

    if (!eq) {
      throw new NotFoundException(`Equipamento ${tag} não encontrado`);
    }

    return this.ocultarValores(eq, verValores);
  }

  async byQr(estabelecimentoId: string, codigo: string) {
    const raw = extrairCodigoQr(codigo);
    if (!raw) throw new NotFoundException("Código QR vazio");
    const eq = await this.prisma.equipamento.findFirst({
      where: {
        estabelecimentoId,
        OR: [
          { tag: { equals: raw, mode: "insensitive" } },
          { qrToken: raw },
        ],
      },
      include: INCLUDE_FICHA,
    });
    if (!eq) throw new NotFoundException("Equipamento não encontrado");
    return this.ocultarValores(eq, false);
  }

  async proximaTag(estabelecimentoId: string) {
    const rows = await this.prisma.equipamento.findMany({
      where: { estabelecimentoId, tag: { startsWith: "HEF-" } },
      select: { tag: true },
    });
    return proximaTagHef(rows.map((r) => r.tag));
  }

  private async assertIdentificadoresUnicos(
    estabelecimentoId: string,
    ids: { tag?: string | null; patrimonio?: string | null; nSerie?: string | null; idInterna?: string | null },
    excludeId?: string,
  ) {
    const tag = normalizarIdent(ids.tag);
    if (tag) {
      const hit = await this.prisma.equipamento.findFirst({
        where: { estabelecimentoId, tag: { equals: tag, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      });
      if (hit) throw new ConflictException(`TAG ${tag} já existe nesta instituição`);
    }
    const patrimonio = normalizarIdent(ids.patrimonio);
    if (patrimonio) {
      const hit = await this.prisma.equipamento.findFirst({
        where: {
          estabelecimentoId,
          patrimonio: { equals: patrimonio, mode: "insensitive" },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      });
      if (hit) throw new ConflictException(`Patrimônio ${patrimonio} já existe nesta instituição`);
    }
    const nSerie = normalizarIdent(ids.nSerie);
    if (serieContaComoDuplicata(nSerie)) {
      const hit = await this.prisma.equipamento.findFirst({
        where: {
          estabelecimentoId,
          nSerie: { equals: nSerie, mode: "insensitive" },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      });
      if (hit) throw new ConflictException(`Nº de série ${nSerie} já existe nesta instituição`);
    }
    const idInterna = normalizarIdent(ids.idInterna);
    if (idInterna) {
      const hit = await this.prisma.equipamento.findFirst({
        where: {
          estabelecimentoId,
          idInterna: { equals: idInterna, mode: "insensitive" },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      });
      if (hit) throw new ConflictException(`ID interna ${idInterna} já existe nesta instituição`);
    }
  }

  private async resolverDefaults(
    estabelecimentoId: string,
    data: { descricaoId?: string; fabricanteId?: string; modeloId?: string },
  ) {
    let descricaoId = data.descricaoId;
    if (!descricaoId) {
      const plano = await this.prisma.planoDescricao.upsert({
        where: { estabelecimentoId_nome: { estabelecimentoId, nome: "Outros" } },
        update: {},
        create: { estabelecimentoId, nome: "Outros", vidaUtilAnos: 10 },
      });
      descricaoId = plano.id;
    }
    let fabricanteId = data.fabricanteId;
    if (!fabricanteId) {
      const fab = await this.prisma.fabricante.upsert({
        where: { estabelecimentoId_nome: { estabelecimentoId, nome: "Não informado" } },
        update: {},
        create: { estabelecimentoId, nome: "Não informado" },
      });
      fabricanteId = fab.id;
    }
    let modeloId = data.modeloId;
    if (!modeloId) {
      const modelo = await this.prisma.modelo.upsert({
        where: { fabricanteId_nome: { fabricanteId, nome: "Não informado" } },
        update: {},
        create: { fabricanteId, nome: "Não informado" },
      });
      modeloId = modelo.id;
    }
    return { descricaoId, fabricanteId, modeloId };
  }

  async create(user: AuthUser, data: CreateEquipamentoInput) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException("Somente Engenheiro/Gestor pode cadastrar equipamentos");
    }
    const nome = normalizarIdent(data.nome);
    if (!nome) throw new BadRequestException("Nome obrigatório");
    if (!data.setorId) throw new BadRequestException("Setor obrigatório");

    const tag = normalizarIdent(data.tag) || (await this.proximaTag(user.estabelecimentoId));
    await this.assertIdentificadoresUnicos(user.estabelecimentoId, {
      tag,
      patrimonio: data.patrimonio,
      nSerie: data.nSerie,
      idInterna: data.idInterna,
    });

    const ids = await this.resolverDefaults(user.estabelecimentoId, data);
    const setor = await this.prisma.setor.findFirst({
      where: { id: data.setorId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!setor) throw new BadRequestException("Setor inválido");

    return this.prisma.equipamento.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        tag,
        nome,
        descricaoId: ids.descricaoId,
        fabricanteId: ids.fabricanteId,
        modeloId: ids.modeloId,
        setorId: data.setorId,
        fornecedorId: data.fornecedorId,
        centroCustoId: data.centroCustoId,
        patrimonio: normalizarIdent(data.patrimonio) || null,
        nSerie: normalizarIdent(data.nSerie) || null,
        idInterna: normalizarIdent(data.idInterna) || null,
        unidade: normalizarIdent(data.unidade) || null,
        localizacaoFisica: normalizarIdent(data.localizacaoFisica) || null,
        propriedade: data.propriedade ?? PropriedadeEquipamento.PROPRIO,
        propriedadeOutra:
          (data.propriedade ?? PropriedadeEquipamento.PROPRIO) === PropriedadeEquipamento.OUTRO
            ? normalizarIdent(data.propriedadeOutra) || null
            : null,
        dataAquisicao: data.dataAquisicao ? new Date(data.dataAquisicao) : null,
        dataInstalacao: data.dataInstalacao ? new Date(data.dataInstalacao) : null,
        valorAquisicao: data.valorAquisicao,
        garantiaInicio: data.garantiaInicio ? new Date(data.garantiaInicio) : null,
        garantiaFim: data.garantiaFim ? new Date(data.garantiaFim) : null,
        registroAnvisa: data.registroAnvisa,
        validadeAnvisa: data.validadeAnvisa ? new Date(data.validadeAnvisa) : null,
        observacao: data.observacao,
        situacao: data.situacao ?? SituacaoEquipamento.ATIVO,
        condicaoUso: data.condicaoUso ?? CondicaoUsoEquipamento.APTO,
        criticidadeEquipamento: data.criticidadeEquipamento,
        criticidadeJustificativa: data.criticidadeJustificativa,
        criticidadeResponsavelId: data.criticidadeResponsavelId,
        qrToken: randomBytes(8).toString("hex"),
        checklistRecebimentoPendente: true,
      },
      include: INCLUDE_FICHA,
    });
  }

  async update(user: AuthUser, tag: string, data: UpdateEquipamentoInput) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "equipamentos")) {
      throw new ForbiddenException("Sem permissão para editar inventário");
    }
    const eq = await this.prisma.equipamento.findUnique({
      where: { estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag } },
    });
    if (!eq) throw new NotFoundException();
    if (eq.situacao === SituacaoEquipamento.ARQUIVADO) {
      throw new ForbiddenException("Equipamento arquivado está somente leitura");
    }

    if (data.tipoEquipamentoPlanoId) {
      const tipo = await this.prisma.tipoEquipamentoPlano.findFirst({
        where: {
          id: data.tipoEquipamentoPlanoId,
          estabelecimentoId: user.estabelecimentoId,
          ativo: true,
        },
      });
      if (!tipo) throw new BadRequestException("Tipo de plano inválido");
    }

    await this.assertIdentificadoresUnicos(
      user.estabelecimentoId,
      {
        patrimonio: data.patrimonio,
        nSerie: data.nSerie,
        idInterna: data.idInterna,
      },
      eq.id,
    );

    const updated = await this.prisma.equipamento.update({
      where: { id: eq.id },
      data: {
        ...(data.nome != null ? { nome: data.nome.trim() } : {}),
        ...(data.setorId != null ? { setorId: data.setorId } : {}),
        ...(data.fabricanteId != null ? { fabricanteId: data.fabricanteId } : {}),
        ...(data.modeloId != null ? { modeloId: data.modeloId } : {}),
        ...(data.fornecedorId !== undefined ? { fornecedorId: data.fornecedorId } : {}),
        ...(data.centroCustoId !== undefined ? { centroCustoId: data.centroCustoId } : {}),
        ...(data.patrimonio !== undefined ? { patrimonio: normalizarIdent(data.patrimonio) || null } : {}),
        ...(data.nSerie !== undefined ? { nSerie: normalizarIdent(data.nSerie) || null } : {}),
        ...(data.idInterna !== undefined ? { idInterna: normalizarIdent(data.idInterna) || null } : {}),
        ...(data.unidade !== undefined ? { unidade: normalizarIdent(data.unidade) || null } : {}),
        ...(data.localizacaoFisica !== undefined
          ? { localizacaoFisica: normalizarIdent(data.localizacaoFisica) || null }
          : {}),
        ...(data.propriedade != null ? { propriedade: data.propriedade } : {}),
        ...(data.propriedade != null || data.propriedadeOutra !== undefined
          ? {
              propriedadeOutra:
                (data.propriedade ?? eq.propriedade) === PropriedadeEquipamento.OUTRO
                  ? normalizarIdent(data.propriedadeOutra) || null
                  : null,
            }
          : {}),
        ...(data.observacao != null ? { observacao: data.observacao } : {}),
        ...(data.situacao != null ? { situacao: data.situacao } : {}),
        ...(data.condicaoUso != null ? { condicaoUso: data.condicaoUso } : {}),
        ...(data.valorAquisicao != null ? { valorAquisicao: data.valorAquisicao } : {}),
        ...(data.valorSubstituicao != null ? { valorSubstituicao: data.valorSubstituicao } : {}),
        ...(data.dataAquisicao !== undefined
          ? { dataAquisicao: data.dataAquisicao ? new Date(data.dataAquisicao) : null }
          : {}),
        ...(data.dataInstalacao !== undefined
          ? { dataInstalacao: data.dataInstalacao ? new Date(data.dataInstalacao) : null }
          : {}),
        ...(data.garantiaInicio !== undefined
          ? { garantiaInicio: data.garantiaInicio ? new Date(data.garantiaInicio) : null }
          : {}),
        ...(data.garantiaFim !== undefined
          ? { garantiaFim: data.garantiaFim ? new Date(data.garantiaFim) : null }
          : {}),
        ...(data.checklistRecebimentoPendente != null
          ? { checklistRecebimentoPendente: data.checklistRecebimentoPendente }
          : {}),
        ...(data.registroAnvisa != null ? { registroAnvisa: data.registroAnvisa } : {}),
        ...(data.validadeAnvisa !== undefined
          ? { validadeAnvisa: data.validadeAnvisa ? new Date(data.validadeAnvisa) : null }
          : {}),
        ...(data.dataEndOfService !== undefined
          ? { dataEndOfService: data.dataEndOfService ? new Date(data.dataEndOfService) : null }
          : {}),
        ...(data.dataEndOfLife !== undefined
          ? { dataEndOfLife: data.dataEndOfLife ? new Date(data.dataEndOfLife) : null }
          : {}),
        ...(data.tipoEquipamentoPlanoId !== undefined
          ? { tipoEquipamentoPlanoId: data.tipoEquipamentoPlanoId || null }
          : {}),
        ...(data.criticidadeEquipamento !== undefined
          ? { criticidadeEquipamento: data.criticidadeEquipamento }
          : {}),
        ...(data.criticidadeJustificativa !== undefined
          ? { criticidadeJustificativa: data.criticidadeJustificativa }
          : {}),
        ...(data.criticidadeResponsavelId !== undefined
          ? { criticidadeResponsavelId: data.criticidadeResponsavelId }
          : {}),
      },
      include: INCLUDE_FICHA,
    });

    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.userId,
        acao: "EDICAO_INVENTARIO",
        detalhe: `tag=${tag} · campos=${Object.keys(data).join(",")}`,
      },
    });

    if (data.tipoEquipamentoPlanoId) {
      await sincronizarInstanciasCatalogo(this.prisma, user.estabelecimentoId, {
        equipamentoId: updated.id,
        usuarioId: user.userId,
      });
    }

    return updated;
  }

  async updateTag(user: AuthUser, tag: string, novaTag: string, justificativa: string) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException("Somente Engenheiro/Gestor pode alterar TAG");
    }
    if (!justificativa?.trim()) {
      throw new BadRequestException("Justificativa obrigatória");
    }

    const atual = await this.prisma.equipamento.findUnique({
      where: { estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag } },
    });
    if (!atual) {
      throw new NotFoundException(`Equipamento ${tag} não encontrado`);
    }
    await this.assertIdentificadoresUnicos(user.estabelecimentoId, { tag: novaTag }, atual.id);

    return this.prisma.$transaction(async (tx) => {
      await tx.historicoTag.create({
        data: {
          equipamentoId: atual.id,
          tagAnterior: atual.tag,
          tagNova: novaTag.trim(),
          justificativa: justificativa.trim(),
          usuarioId: user.userId,
        },
      });
      return tx.equipamento.update({
        where: { id: atual.id },
        data: { tag: novaTag.trim() },
        include: INCLUDE_FICHA,
      });
    });
  }

  async arquivar(user: AuthUser, tag: string) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException();
    }
    const eq = await this.prisma.equipamento.findUnique({
      where: { estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag } },
    });
    if (!eq) throw new NotFoundException();

    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.userId,
        acao: "ARQUIVAR_EQUIPAMENTO",
        detalhe: tag,
      },
    });

    return this.prisma.equipamento.update({
      where: { id: eq.id },
      data: { situacao: SituacaoEquipamento.ARQUIVADO },
      include: INCLUDE_FICHA,
    });
  }

  async reativar(user: AuthUser, tag: string) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException();
    }
    const eq = await this.prisma.equipamento.findUnique({
      where: { estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag } },
    });
    if (!eq) throw new NotFoundException();

    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.userId,
        acao: "REATIVAR_EQUIPAMENTO",
        detalhe: tag,
      },
    });

    return this.prisma.equipamento.update({
      where: { id: eq.id },
      data: { situacao: SituacaoEquipamento.ATIVO, dataDesativacao: null, motivoDesativacao: null },
      include: INCLUDE_FICHA,
    });
  }

  async pagina(user: AuthUser, tag: string, verValores: boolean) {
    const eq = await this.prisma.equipamento.findUnique({
      where: { estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag } },
      include: {
        ...INCLUDE_FICHA,
        movimentacoes: {
          orderBy: { data: "desc" },
          take: 50,
          include: {
            origemSetor: { select: { id: true, nome: true } },
            destinoSetor: { select: { id: true, nome: true } },
          },
        },
        documentos: {
          orderBy: { createdAt: "desc" },
          select: { id: true, tipo: true, nomeArquivo: true, mimeType: true, descricao: true, createdAt: true },
        },
        eventosCiclo: { orderBy: { data: "desc" }, include: { documento: { select: { id: true, nomeArquivo: true } } } },
      },
    });
    if (!eq) throw new NotFoundException(`Equipamento ${tag} não encontrado`);

    const [osAbertas, osHistorico, custosAgg] = await Promise.all([
      this.prisma.ordemServico.findMany({
        where: {
          estabelecimentoId: user.estabelecimentoId,
          equipamentoId: eq.id,
          status: { in: [...STATUS_OS_ATIVAS] },
        },
        orderBy: { abertura: "desc" },
        select: { numero: true, codigo: true, tipo: true, status: true, prioridade: true, abertura: true },
      }),
      this.prisma.ordemServico.findMany({
        where: { estabelecimentoId: user.estabelecimentoId, equipamentoId: eq.id },
        orderBy: { abertura: "desc" },
        take: 40,
        select: {
          numero: true,
          codigo: true,
          tipo: true,
          status: true,
          prioridade: true,
          abertura: true,
          fechamento: true,
          servicoRealizado: true,
        },
      }),
      this.prisma.ordemServicoItem.aggregate({
        where: { ordemServico: { estabelecimentoId: user.estabelecimentoId, equipamentoId: eq.id } },
        _sum: { valorUnitario: true },
        _count: true,
      }),
    ]);

    const itens = await this.prisma.ordemServicoItem.findMany({
      where: { ordemServico: { estabelecimentoId: user.estabelecimentoId, equipamentoId: eq.id } },
      select: { quantidade: true, valorUnitario: true },
    });
    const totalOS = itens.reduce((acc, i) => acc + Number(i.quantidade) * Number(i.valorUnitario ?? 0), 0);

    const [contratosCobertura, atendimentos] = await Promise.all([
      this.prisma.contratoEquipamento.findMany({
        where: { equipamentoId: eq.id, contrato: { estabelecimentoId: user.estabelecimentoId } },
        include: { contrato: { include: { fornecedor: { select: { nome: true } } } } },
      }),
      this.prisma.atendimentoExterno.findMany({
        where: { equipamentoId: eq.id, estabelecimentoId: user.estabelecimentoId },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          fornecedor: { select: { nome: true } },
          ordemServico: { select: { numero: true, codigo: true } },
        },
      }),
    ]);
    const agora = Date.now();
    const custosExt = atendimentos.reduce(
      (acc, a) => {
        acc.informado += Number(a.custoInformado ?? 0);
        acc.aprovado += Number(a.custoAprovado ?? 0);
        acc.realizado += Number(a.custoRealizado ?? 0);
        return acc;
      },
      { informado: 0, aprovado: 0, realizado: 0 },
    );
    const fora = atendimentos.find((a) => a.foraDoHospital || a.pendenciaRetorno);

    const criticidade = eq.criticidadeEquipamento ?? eq.descricao.criticidade;
    return {
      ...this.ocultarValores(eq, verValores),
      criticidade,
      garantiaVigente: garantiaVigente(eq.garantiaFim),
      osAbertas,
      osHistorico,
      custos: {
        totalOS: Number(totalOS.toFixed(2)),
        nItens: custosAgg._count,
        nOS: osHistorico.length,
        externoInformado: Number(custosExt.informado.toFixed(2)),
        externoAprovado: Number(custosExt.aprovado.toFixed(2)),
        externoRealizado: Number(custosExt.realizado.toFixed(2)),
      },
      cobertura: {
        garantiaAquisicao: {
          fonte: "GARANTIA_AQUISICAO",
          vigente: garantiaVigente(eq.garantiaFim),
          inicio: eq.garantiaInicio,
          fim: eq.garantiaFim,
        },
        contratosManutencao: contratosCobertura.map((l) => ({
          fonte: "CONTRATO_MANUTENCAO",
          numero: l.contrato.numero,
          fornecedor: l.contrato.fornecedor.nome,
          vigenciaFim: l.contrato.vigenciaFim,
          vigente: l.contrato.vigenciaFim.getTime() >= agora,
          cobrePecas: l.contrato.cobrePecas,
          cobreServicos: l.contrato.cobreServicos,
          escopo: l.contrato.escopo,
          exclusoes: l.contrato.exclusoes,
        })),
      },
      atendimentosExternos: atendimentos.map((a) => ({
        id: a.id,
        status: a.status,
        fornecedor: a.fornecedor.nome,
        osNumero: a.ordemServico.numero,
        osCodigo: a.ordemServico.codigo,
        foraDoHospital: a.foraDoHospital,
        pendenciaRetorno: a.pendenciaRetorno,
        previsaoRetorno: a.previsaoRetorno,
        conferenciaOk: a.conferenciaOk,
        custoInformado: a.custoInformado,
        custoAprovado: a.custoAprovado,
        custoRealizado: a.custoRealizado,
      })),
      localizacaoAssistencia: fora
        ? {
            foraDoHospital: fora.foraDoHospital,
            pendenciaRetorno: fora.pendenciaRetorno,
            status: fora.status,
            fornecedor: fora.fornecedor.nome,
          }
        : null,
    };
  }

  async ensureQrToken(eqId: string) {
    const eq = await this.prisma.equipamento.findUnique({ where: { id: eqId } });
    if (!eq) throw new NotFoundException();
    if (eq.qrToken) return eq.qrToken;
    const token = randomBytes(8).toString("hex");
    await this.prisma.equipamento.update({ where: { id: eqId }, data: { qrToken: token } });
    return token;
  }

  async etiqueta(user: AuthUser, tag: string) {
    const eq = await this.prisma.equipamento.findUnique({
      where: { estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag } },
      include: { setor: true },
    });
    if (!eq) throw new NotFoundException();
    const token = await this.ensureQrToken(eq.id);
    const payload = payloadQrAutenticado(token);
    return {
      tag: eq.tag,
      nome: eq.nome,
      setor: eq.setor.nome,
      patrimonio: eq.patrimonio,
      payload,
      svg: qrSvg(payload),
    };
  }

  async movimentar(
    user: AuthUser,
    tag: string,
    body: {
      tipo: TipoMovimentacaoEquipamento;
      destinoSetorId?: string;
      destinoLocalizacao?: string;
      data?: string;
      responsavelNome?: string;
      responsavelId?: string;
      motivo: string;
    },
  ) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "equipamentos")) {
      throw new ForbiddenException();
    }
    const eq = await this.prisma.equipamento.findUnique({
      where: { estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag } },
    });
    if (!eq) throw new NotFoundException();
    if (eq.situacao === SituacaoEquipamento.ARQUIVADO) {
      throw new ForbiddenException("Equipamento arquivado não se movimenta");
    }
    if (!body.motivo?.trim()) throw new BadRequestException("Motivo obrigatório");

    let destinoSetorId = body.destinoSetorId || null;
    if (destinoSetorId) {
      const setor = await this.prisma.setor.findFirst({
        where: { id: destinoSetorId, estabelecimentoId: user.estabelecimentoId },
      });
      if (!setor) throw new BadRequestException("Setor de destino inválido");
    }

    const destinoLocalizacao = normalizarIdent(body.destinoLocalizacao) || null;
    const transferencia = body.tipo === TipoMovimentacaoEquipamento.TRANSFERENCIA_SETOR;
    const retorno = body.tipo === TipoMovimentacaoEquipamento.RETORNO;
    if ((transferencia || retorno) && !destinoSetorId) {
      throw new BadRequestException("Informe o setor de destino");
    }

    let responsavelNome = normalizarIdent(body.responsavelNome);
    if (body.responsavelId) {
      const colab = await this.prisma.colaborador.findFirst({
        where: { id: body.responsavelId, estabelecimentoId: user.estabelecimentoId },
      });
      if (!colab) throw new BadRequestException("Responsável inválido");
      responsavelNome = responsavelNome || colab.nome;
    }
    if (!responsavelNome) throw new BadRequestException("Informe o responsável");

    const mov = await this.prisma.equipamentoMovimentacao.create({
      data: {
        equipamentoId: eq.id,
        tipo: body.tipo,
        origemSetorId: eq.setorId,
        destinoSetorId,
        origemLocalizacao: eq.localizacaoFisica,
        destinoLocalizacao,
        data: body.data ? new Date(body.data) : new Date(),
        responsavelNome,
        responsavelId: body.responsavelId || null,
        motivo: body.motivo.trim(),
        usuarioId: user.userId,
      },
    });

    const patch: Prisma.EquipamentoUpdateInput = {};
    if (destinoSetorId && (transferencia || retorno)) patch.setor = { connect: { id: destinoSetorId } };
    if (destinoLocalizacao !== null) patch.localizacaoFisica = destinoLocalizacao;
    if (Object.keys(patch).length) {
      await this.prisma.equipamento.update({ where: { id: eq.id }, data: patch });
    }

    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.userId,
        acao: "MOVIMENTAR_EQUIPAMENTO",
        detalhe: `tag=${tag} · ${body.tipo}`,
      },
    });

    return mov;
  }

  async addDocumento(
    user: AuthUser,
    tag: string,
    body: { tipo: TipoDocumentoEquipamento; dataUrl: string; nomeArquivo?: string; descricao?: string },
  ) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "equipamentos")) {
      throw new ForbiddenException();
    }
    const eq = await this.prisma.equipamento.findUnique({
      where: { estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag } },
    });
    if (!eq) throw new NotFoundException();
    const parsed = parseAnexoDataUrl(body.dataUrl, body.nomeArquivo);
    const doc = await this.prisma.equipamentoDocumento.create({
      data: {
        equipamentoId: eq.id,
        tipo: body.tipo,
        nomeArquivo: parsed.nomeArquivo,
        mimeType: parsed.mimeType,
        conteudo: parsed.buffer,
        descricao: body.descricao?.trim() || null,
        usuarioId: user.userId,
      },
      select: { id: true, tipo: true, nomeArquivo: true, mimeType: true, descricao: true, createdAt: true },
    });
    return doc;
  }

  async getDocumento(user: AuthUser, tag: string, id: string) {
    const eq = await this.prisma.equipamento.findUnique({
      where: { estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag } },
    });
    if (!eq) throw new NotFoundException();
    const doc = await this.prisma.equipamentoDocumento.findFirst({
      where: { id, equipamentoId: eq.id },
    });
    if (!doc) throw new NotFoundException("Documento não encontrado");
    return doc;
  }

  async registrarCiclo(
    user: AuthUser,
    tag: string,
    body: {
      tipo: EventoCicloVida;
      data?: string;
      observacao?: string;
      motivoDesativacao?: string;
      documento?: { dataUrl: string; nomeArquivo?: string };
    },
  ) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException();
    }
    const eq = await this.prisma.equipamento.findUnique({
      where: { estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag } },
    });
    if (!eq) throw new NotFoundException();

    const precisaEvidencia = body.tipo !== EventoCicloVida.ENTRADA_OPERACAO;
    if (precisaEvidencia && !body.documento?.dataUrl && !normalizarIdent(body.observacao)) {
      throw new BadRequestException("Informe evidência (foto/PDF) ou observação");
    }
    if (body.tipo === EventoCicloVida.DESATIVACAO && !normalizarIdent(body.motivoDesativacao ?? body.observacao)) {
      throw new BadRequestException("Informe o motivo da desativação");
    }

    let documentoId: string | undefined;
    if (body.documento?.dataUrl) {
      const tipoDoc =
        body.tipo === EventoCicloVida.RECEBIMENTO
          ? TipoDocumentoEquipamento.EVIDENCIA_RECEBIMENTO
          : body.tipo === EventoCicloVida.ENTRADA_OPERACAO
            ? TipoDocumentoEquipamento.EVIDENCIA_ENTRADA_OPERACAO
            : TipoDocumentoEquipamento.EVIDENCIA_DESATIVACAO;
      const doc = await this.addDocumento(user, tag, {
        tipo: tipoDoc,
        dataUrl: body.documento.dataUrl,
        nomeArquivo: body.documento.nomeArquivo,
        descricao: body.tipo,
      });
      documentoId = doc.id;
    }

    const data = body.data ? new Date(body.data) : new Date();
    const evento = await this.prisma.equipamentoEventoCiclo.create({
      data: {
        equipamentoId: eq.id,
        tipo: body.tipo,
        data,
        observacao: body.observacao?.trim() || body.motivoDesativacao?.trim() || null,
        usuarioId: user.userId,
        documentoId,
      },
    });

    const patch: Prisma.EquipamentoUpdateInput = {};
    if (body.tipo === EventoCicloVida.RECEBIMENTO) {
      patch.dataRecebimento = data;
      patch.checklistRecebimentoPendente = false;
    }
    if (body.tipo === EventoCicloVida.ENTRADA_OPERACAO) {
      patch.dataEntradaOperacao = data;
      if (eq.situacao === SituacaoEquipamento.INATIVO) patch.situacao = SituacaoEquipamento.ATIVO;
    }
    if (body.tipo === EventoCicloVida.DESATIVACAO) {
      patch.dataDesativacao = data;
      patch.motivoDesativacao = body.motivoDesativacao?.trim() || body.observacao?.trim() || null;
      patch.situacao = SituacaoEquipamento.INATIVO;
    }
    await this.prisma.equipamento.update({ where: { id: eq.id }, data: patch });
    return evento;
  }

  async importTemplate() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Equipamentos");
    ws.columns = COLUNAS_IMPORT.map((key) => ({ header: key, key, width: 18 }));
    ws.getRow(1).font = { bold: true };
    ws.addRow({
      tag: "",
      nome: "Monitor multiparamétrico",
      planoDescricao: "Monitor",
      fabricante: "Philips",
      modelo: "IntelliVue",
      setor: "UTI Adulto",
      unidade: "HEF",
      localizacaoFisica: "Leito 12",
      patrimonio: "PAT-001",
      idInterna: "INT-001",
      nSerie: "SN-001",
      propriedade: "PROPRIO",
      dataAquisicao: "2024-01-15",
      valorAquisicao: 12000,
      garantiaInicio: "2024-01-15",
      garantiaFim: "2026-01-15",
      observacao: "Cadastro mínimo: deixe a TAG vazia para gerar HEF-NNNN",
    });
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  private async indiceExistentes(estabelecimentoId: string): Promise<IndiceExistentes> {
    const rows = await this.prisma.equipamento.findMany({
      where: { estabelecimentoId },
      select: { tag: true, nSerie: true, patrimonio: true, idInterna: true },
    });
    const tags = new Set<string>();
    const series = new Set<string>();
    const patrimonios = new Set<string>();
    const idInternas = new Set<string>();
    for (const r of rows) {
      if (r.tag) tags.add(r.tag.toLocaleLowerCase("pt-BR"));
      if (serieContaComoDuplicata(r.nSerie)) series.add(r.nSerie!.toLocaleLowerCase("pt-BR"));
      if (r.patrimonio?.trim()) patrimonios.add(r.patrimonio.toLocaleLowerCase("pt-BR"));
      if (r.idInterna?.trim()) idInternas.add(r.idInterna.toLocaleLowerCase("pt-BR"));
    }
    return { tags, series, patrimonios, idInternas };
  }

  async importPreview(user: AuthUser, rows: ImportRowIn[]) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    const existentes = await this.indiceExistentes(user.estabelecimentoId);
    const resultados = validarLoteImportacao(rows, existentes);
    return {
      total: rows.length,
      ok: resultados.filter((r) => r.ok).length,
      erros: resultados.filter((r) => !r.ok),
      resultados,
    };
  }

  async parseArquivoImport(filename: string, contentBase64: string): Promise<ImportRowIn[]> {
    const raw = contentBase64.includes(",") ? contentBase64.split(",").pop()! : contentBase64;
    const buf = Buffer.from(raw, "base64");
    if (!buf.length) throw new BadRequestException("Arquivo vazio");
    const name = filename.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      // exceljs e @types/node discordam no branded Buffer
      await wb.xlsx.load(buf as never);
      const ws = wb.worksheets[0];
      if (!ws) throw new BadRequestException("Planilha sem aba");
      const header: string[] = [];
      ws.getRow(1).eachCell((cell, col) => {
        header[col] = String(cell.value ?? "").trim();
      });
      const rows: ImportRowIn[] = [];
      ws.eachRow((row, i) => {
        if (i === 1) return;
        const obj: Record<string, unknown> = {};
        row.eachCell((cell, col) => {
          const key = header[col];
          if (key) obj[key] = cell.value != null ? String(cell.value).trim() : "";
        });
        if (Object.values(obj).some((v) => String(v ?? "").trim())) rows.push(obj as ImportRowIn);
      });
      return rows;
    }
    const text = buf.toString("utf8").replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const sep = lines[0].includes(";") ? ";" : ",";
    const headers = lines[0].split(sep).map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cols = line.split(sep).map((c) => c.trim());
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = cols[i] ?? "";
      });
      return obj as ImportRowIn;
    });
  }

  async importRows(user: AuthUser, rows: ImportRowIn[]) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    const preview = await this.importPreview(user, rows);
    const resultados: Array<{ linha: number; tag: string; ok: boolean; erro?: string }> = [];

    for (const item of preview.resultados) {
      if (!item.ok) {
        resultados.push({ linha: item.linha, tag: item.tag, ok: false, erro: item.erro });
        continue;
      }
      const row = item.row;
      try {
        const planoNome = String(row.planoDescricao ?? "Outros").trim() || "Outros";
        const fabNome = String(row.fabricante ?? "Não informado").trim() || "Não informado";
        const setorNome = String(row.setor ?? "Geral").trim() || "Geral";
        const modeloNome = String(row.modelo ?? "Não informado").trim() || "Não informado";

        const [plano, fab, setor] = await Promise.all([
          this.prisma.planoDescricao.upsert({
            where: { estabelecimentoId_nome: { estabelecimentoId: user.estabelecimentoId, nome: planoNome } },
            update: {},
            create: { estabelecimentoId: user.estabelecimentoId, nome: planoNome, vidaUtilAnos: 10 },
          }),
          this.prisma.fabricante.upsert({
            where: { estabelecimentoId_nome: { estabelecimentoId: user.estabelecimentoId, nome: fabNome } },
            update: {},
            create: { estabelecimentoId: user.estabelecimentoId, nome: fabNome },
          }),
          this.prisma.setor.upsert({
            where: { estabelecimentoId_nome: { estabelecimentoId: user.estabelecimentoId, nome: setorNome } },
            update: {},
            create: { estabelecimentoId: user.estabelecimentoId, nome: setorNome },
          }),
        ]);
        const modelo = await this.prisma.modelo.upsert({
          where: { fabricanteId_nome: { fabricanteId: fab.id, nome: modeloNome } },
          update: {},
          create: { fabricanteId: fab.id, nome: modeloNome },
        });

        const created = await this.create(user, {
          tag: row.tag,
          nome: String(row.nome).trim(),
          descricaoId: plano.id,
          fabricanteId: fab.id,
          modeloId: modelo.id,
          setorId: setor.id,
          patrimonio: row.patrimonio,
          nSerie: row.nSerie,
          idInterna: row.idInterna,
          unidade: row.unidade,
          localizacaoFisica: row.localizacaoFisica,
          propriedade: (["PROPRIO", "LOCADO", "COMODATO", "OUTRO"] as const).includes(
            String(row.propriedade ?? "").toUpperCase() as PropriedadeEquipamento,
          )
            ? (String(row.propriedade).toUpperCase() as PropriedadeEquipamento)
            : undefined,
          propriedadeOutra: row.propriedadeOutra,
          dataAquisicao: row.dataAquisicao,
          dataInstalacao: row.dataInstalacao,
          valorAquisicao: row.valorAquisicao != null && row.valorAquisicao !== "" ? Number(row.valorAquisicao) : undefined,
          garantiaInicio: row.garantiaInicio,
          garantiaFim: row.garantiaFim,
          observacao: row.observacao,
        });
        resultados.push({ linha: item.linha, tag: created.tag, ok: true });
      } catch (e) {
        resultados.push({
          linha: item.linha,
          tag: item.tag,
          ok: false,
          erro: e instanceof Error ? e.message : "Erro",
        });
      }
    }

    return {
      total: rows.length,
      ok: resultados.filter((r) => r.ok).length,
      erros: resultados.filter((r) => !r.ok),
      resultados,
    };
  }
}
