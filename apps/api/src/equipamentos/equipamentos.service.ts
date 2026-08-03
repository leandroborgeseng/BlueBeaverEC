import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, SituacaoEquipamento } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";
import { podeEditarCadastros } from "@aion/shared";

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
    const where: Prisma.EquipamentoWhereInput = {
      estabelecimentoId,
      ...(query.setor ? { setorId: query.setor } : {}),
      ...(query.fabricante ? { fabricanteId: query.fabricante } : {}),
      ...(query.modelo ? { modeloId: query.modelo } : {}),
      ...(query.situacao ? { situacao: query.situacao } : {}),
      ...(query.q
        ? {
            OR: [
              { tag: { contains: query.q, mode: "insensitive" } },
              { nome: { contains: query.q, mode: "insensitive" } },
              { patrimonio: { contains: query.q, mode: "insensitive" } },
              { nSerie: { contains: query.q, mode: "insensitive" } },
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

  /** Inventário completo para relatório (sem paginação). */
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
      setor: eq.setor.nome,
      fabricante: eq.fabricante.nome,
      modelo: eq.modelo.nome,
      descricao: eq.descricao.nome,
      criticidade: eq.descricao.criticidade,
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

  async byTag(estabelecimentoId: string, tag: string, verValores: boolean) {
    const eq = await this.prisma.equipamento.findUnique({
      where: { estabelecimentoId_tag: { estabelecimentoId, tag } },
      include: {
        setor: true,
        fabricante: true,
        modelo: true,
        descricao: true,
        fornecedor: true,
        centroCusto: true,
        historicoTags: { orderBy: { createdAt: "desc" }, take: 20 },
        tipoEquipamentoPlano: {
          include: {
            testes: {
              where: { ativo: true },
              orderBy: { tipoTeste: "asc" },
              select: {
                tipoTeste: true,
                procedimentoCodigo: true,
                periodicidadeMeses: true,
                ativo: true,
              },
            },
          },
        },
      },
    });

    if (!eq) {
      throw new NotFoundException(`Equipamento ${tag} não encontrado`);
    }

    if (!verValores) {
      const { valorAquisicao: _a, valorSubstituicao: _s, ...rest } = eq;
      return { ...rest, valorAquisicao: null, valorSubstituicao: null };
    }

    return eq;
  }

  async byQr(estabelecimentoId: string, codigo: string) {
    return this.byTag(estabelecimentoId, codigo, false);
  }

  async create(
    user: AuthUser,
    data: {
      tag: string;
      nome: string;
      descricaoId: string;
      fabricanteId: string;
      modeloId: string;
      setorId: string;
      fornecedorId?: string;
      centroCustoId?: string;
      patrimonio?: string;
      nSerie?: string;
      dataAquisicao?: string;
      dataInstalacao?: string;
      valorAquisicao?: number;
      registroAnvisa?: string;
      validadeAnvisa?: string;
      observacao?: string;
      situacao?: SituacaoEquipamento;
    },
  ) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException("Somente Engenheiro/Gestor pode cadastrar equipamentos");
    }
    return this.prisma.equipamento.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        tag: data.tag.trim(),
        nome: data.nome.trim(),
        descricaoId: data.descricaoId,
        fabricanteId: data.fabricanteId,
        modeloId: data.modeloId,
        setorId: data.setorId,
        fornecedorId: data.fornecedorId,
        centroCustoId: data.centroCustoId,
        patrimonio: data.patrimonio,
        nSerie: data.nSerie,
        dataAquisicao: data.dataAquisicao ? new Date(data.dataAquisicao) : null,
        dataInstalacao: data.dataInstalacao ? new Date(data.dataInstalacao) : null,
        valorAquisicao: data.valorAquisicao,
        registroAnvisa: data.registroAnvisa,
        validadeAnvisa: data.validadeAnvisa ? new Date(data.validadeAnvisa) : null,
        observacao: data.observacao,
        situacao: data.situacao ?? SituacaoEquipamento.ATIVO,
      },
      include: {
        setor: true,
        fabricante: true,
        modelo: true,
        descricao: true,
      },
    });
  }

  async update(
    user: AuthUser,
    tag: string,
    data: {
      nome?: string;
      setorId?: string;
      fabricanteId?: string;
      modeloId?: string;
      fornecedorId?: string | null;
      centroCustoId?: string | null;
      patrimonio?: string;
      nSerie?: string;
      observacao?: string;
      situacao?: SituacaoEquipamento;
      valorAquisicao?: number;
      valorSubstituicao?: number;
      checklistRecebimentoPendente?: boolean;
      registroAnvisa?: string;
      validadeAnvisa?: string | null;
      dataEndOfService?: string | null;
      dataEndOfLife?: string | null;
      tipoEquipamentoPlanoId?: string | null;
    },
  ) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException("Somente Engenheiro pode salvar alterações");
    }
    const eq = await this.prisma.equipamento.findUnique({
      where: {
        estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag },
      },
    });
    if (!eq) throw new NotFoundException();
    if (eq.situacao === SituacaoEquipamento.ARQUIVADO || eq.situacao === SituacaoEquipamento.INATIVO) {
      throw new ForbiddenException("Equipamento arquivado/inativo está somente leitura");
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

    return this.prisma.equipamento.update({
      where: { id: eq.id },
      data: {
        ...(data.nome != null ? { nome: data.nome.trim() } : {}),
        ...(data.setorId != null ? { setorId: data.setorId } : {}),
        ...(data.fabricanteId != null ? { fabricanteId: data.fabricanteId } : {}),
        ...(data.modeloId != null ? { modeloId: data.modeloId } : {}),
        ...(data.fornecedorId !== undefined ? { fornecedorId: data.fornecedorId } : {}),
        ...(data.centroCustoId !== undefined ? { centroCustoId: data.centroCustoId } : {}),
        ...(data.patrimonio != null ? { patrimonio: data.patrimonio } : {}),
        ...(data.nSerie != null ? { nSerie: data.nSerie } : {}),
        ...(data.observacao != null ? { observacao: data.observacao } : {}),
        ...(data.situacao != null ? { situacao: data.situacao } : {}),
        ...(data.valorAquisicao != null ? { valorAquisicao: data.valorAquisicao } : {}),
        ...(data.valorSubstituicao != null ? { valorSubstituicao: data.valorSubstituicao } : {}),
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
      },
      include: {
        setor: true,
        fabricante: true,
        modelo: true,
        descricao: true,
        tipoEquipamentoPlano: {
          include: {
            testes: {
              where: { ativo: true },
              orderBy: { tipoTeste: "asc" },
              select: {
                tipoTeste: true,
                procedimentoCodigo: true,
                periodicidadeMeses: true,
                ativo: true,
              },
            },
          },
        },
      },
    });
  }

  async updateTag(user: AuthUser, tag: string, novaTag: string, justificativa: string) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException("Somente Engenheiro/Gestor pode alterar TAG");
    }
    if (!justificativa?.trim()) {
      throw new BadRequestException("Justificativa obrigatória");
    }

    const atual = await this.prisma.equipamento.findUnique({
      where: {
        estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag },
      },
    });
    if (!atual) {
      throw new NotFoundException(`Equipamento ${tag} não encontrado`);
    }

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
      });
    });
  }

  async arquivar(user: AuthUser, tag: string) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException();
    }
    const eq = await this.prisma.equipamento.findUnique({
      where: {
        estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag },
      },
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
    });
  }

  async reativar(user: AuthUser, tag: string) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) {
      throw new ForbiddenException();
    }
    const eq = await this.prisma.equipamento.findUnique({
      where: {
        estabelecimentoId_tag: { estabelecimentoId: user.estabelecimentoId, tag },
      },
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
      data: { situacao: SituacaoEquipamento.ATIVO },
    });
  }

  async importTemplate() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Equipamentos");
    ws.columns = [
      { header: "tag", key: "tag", width: 14 },
      { header: "nome", key: "nome", width: 28 },
      { header: "planoDescricao", key: "planoDescricao", width: 22 },
      { header: "fabricante", key: "fabricante", width: 18 },
      { header: "modelo", key: "modelo", width: 18 },
      { header: "setor", key: "setor", width: 18 },
      { header: "patrimonio", key: "patrimonio", width: 14 },
      { header: "nSerie", key: "nSerie", width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRow({
      tag: "EQ-EXEMPLO",
      nome: "Monitor multiparamétrico",
      planoDescricao: "Monitor",
      fabricante: "Philips",
      modelo: "IntelliVue",
      setor: "UTI Adulto",
      patrimonio: "PAT-001",
      nSerie: "SN-001",
    });
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async importRows(
    user: AuthUser,
    rows: Array<{
      tag: string;
      nome: string;
      planoDescricao: string;
      fabricante: string;
      modelo: string;
      setor: string;
      patrimonio?: string;
      nSerie?: string;
      registroAnvisa?: string;
      validadeAnvisa?: string;
      dataAquisicao?: string;
      dataInstalacao?: string;
      valorAquisicao?: number;
      observacao?: string;
    }>,
  ) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    const resultados: Array<{ tag: string; ok: boolean; erro?: string }> = [];

    for (const row of rows) {
      const tag = String(row.tag ?? "").trim();
      try {
        if (!tag || !row.nome?.trim()) throw new BadRequestException("tag e nome obrigatórios");

        const planoNome = String(row.planoDescricao ?? "Outros").trim() || "Outros";
        const fabNome = String(row.fabricante ?? "Não informado").trim() || "Não informado";
        const setorNome = String(row.setor ?? "Geral").trim() || "Geral";
        const modeloNome = String(row.modelo ?? "Não informado").trim() || "Não informado";

        const [plano, fab, setor] = await Promise.all([
          this.prisma.planoDescricao.upsert({
            where: {
              estabelecimentoId_nome: {
                estabelecimentoId: user.estabelecimentoId,
                nome: planoNome,
              },
            },
            update: {},
            create: {
              estabelecimentoId: user.estabelecimentoId,
              nome: planoNome,
              vidaUtilAnos: 10,
            },
          }),
          this.prisma.fabricante.upsert({
            where: {
              estabelecimentoId_nome: {
                estabelecimentoId: user.estabelecimentoId,
                nome: fabNome,
              },
            },
            update: {},
            create: { estabelecimentoId: user.estabelecimentoId, nome: fabNome },
          }),
          this.prisma.setor.upsert({
            where: {
              estabelecimentoId_nome: {
                estabelecimentoId: user.estabelecimentoId,
                nome: setorNome,
              },
            },
            update: {},
            create: { estabelecimentoId: user.estabelecimentoId, nome: setorNome },
          }),
        ]);

        const modelo = await this.prisma.modelo.upsert({
          where: { fabricanteId_nome: { fabricanteId: fab.id, nome: modeloNome } },
          update: {},
          create: { fabricanteId: fab.id, nome: modeloNome },
        });

        const existing = await this.prisma.equipamento.findUnique({
          where: {
            estabelecimentoId_tag: {
              estabelecimentoId: user.estabelecimentoId,
              tag,
            },
          },
        });

        if (existing) {
          await this.update(user, tag, {
            nome: String(row.nome).trim(),
            patrimonio: row.patrimonio ? String(row.patrimonio) : undefined,
            nSerie: row.nSerie ? String(row.nSerie) : undefined,
            registroAnvisa: row.registroAnvisa,
            validadeAnvisa: row.validadeAnvisa ?? null,
            valorAquisicao: row.valorAquisicao,
            observacao: row.observacao,
          });
          if (row.dataAquisicao || row.dataInstalacao) {
            await this.prisma.equipamento.update({
              where: { id: existing.id },
              data: {
                ...(row.dataAquisicao ? { dataAquisicao: new Date(row.dataAquisicao) } : {}),
                ...(row.dataInstalacao ? { dataInstalacao: new Date(row.dataInstalacao) } : {}),
              },
            });
          }
        } else {
          await this.create(user, {
            tag,
            nome: String(row.nome).trim(),
            descricaoId: plano.id,
            fabricanteId: fab.id,
            modeloId: modelo.id,
            setorId: setor.id,
            patrimonio: row.patrimonio ? String(row.patrimonio) : undefined,
            nSerie: row.nSerie ? String(row.nSerie) : undefined,
            registroAnvisa: row.registroAnvisa,
            validadeAnvisa: row.validadeAnvisa,
            dataAquisicao: row.dataAquisicao,
            dataInstalacao: row.dataInstalacao,
            valorAquisicao: row.valorAquisicao,
            observacao: row.observacao,
          });
        }
        resultados.push({ tag, ok: true });
      } catch (e) {
        resultados.push({
          tag: tag || "(vazio)",
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
