import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrioridadeOS, ResultadoLaudo, StatusDocumentoLaudo, TipoLaudo, TipoOS } from "@prisma/client";
import { PERMISSAO_NIVEL, temPermissao } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OsService } from "../os/os.service";
import { ContratosService } from "../contratos/contratos.service";
import type { AuthUser } from "../auth/current-user.decorator";
import { agendarProximaOsPlano } from "../planos/proxima-os-plano";
import {
  avaliarPontoCalibracao,
  calcularResultadoLaudo,
  itensObrigatoriosPendentes,
  snapshotInstrumentoNaData,
  statusCertificadoNaData,
  tituloDocumentoTecnico,
  type ItemChecklistModelo,
  type RespostaChecklist,
} from "./laudo-regras";
import { buildRelatorioServicoPdf, type RelatorioServicoPayload } from "./relatorio-servico-pdf";

type RespostaItem = RespostaChecklist;

@Injectable()
export class LaudosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly os: OsService,
    private readonly contratos: ContratosService,
  ) {}

  list(
    estabelecimentoId: string,
    tipo?: TipoLaudo,
    equipamentoTag?: string,
    resultado?: ResultadoLaudo,
  ) {
    return this.prisma.laudo.findMany({
      where: {
        estabelecimentoId,
        ...(tipo ? { tipo } : {}),
        ...(resultado ? { resultado } : {}),
        ...(equipamentoTag ? { equipamento: { tag: equipamentoTag } } : {}),
      },
      include: {
        equipamento: true,
        procedimento: true,
        instrumento: true,
        responsavelTecnico: true,
      },
      orderBy: { dataExecucao: "desc" },
      take: 100,
    });
  }

  async byId(estabelecimentoId: string, id: string) {
    const laudo = await this.prisma.laudo.findFirst({
      where: { id, estabelecimentoId },
      include: {
        equipamento: { include: { modelo: true, fabricante: true, descricao: true, setor: true } },
        procedimento: true,
        instrumento: true,
        responsavelTecnico: true,
        anexos: { select: { id: true, nomeArquivo: true, mimeType: true, createdAt: true } },
        revisoes: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!laudo) throw new NotFoundException();
    return laudo;
  }

  async create(
    user: AuthUser,
    data: {
      tipo: TipoLaudo;
      equipamentoTag: string;
      procedimentoId?: string;
      instrumentoId?: string;
      responsavelTecnicoId?: string;
      tecnicoNome?: string;
      osNumero?: number;
      respostas?: RespostaItem[];
      metadados?: Record<string, unknown>;
      resultado?: ResultadoLaudo;
      justificativaRessalva?: string;
      validadeMeses?: number;
    },
  ) {
    const equipamento = await this.prisma.equipamento.findUnique({
      where: {
        estabelecimentoId_tag: {
          estabelecimentoId: user.estabelecimentoId,
          tag: data.equipamentoTag,
        },
      },
    });
    if (!equipamento) throw new NotFoundException("Equipamento não encontrado");

    if (data.tipo === TipoLaudo.CALIBRACAO || data.tipo === TipoLaudo.TSE) {
      if (!data.responsavelTecnicoId) {
        throw new BadRequestException("Responsável técnico obrigatório para Calibração/TSE");
      }
    }

    if (data.resultado === ResultadoLaudo.APROVADO_COM_RESSALVAS && !data.justificativaRessalva?.trim()) {
      throw new BadRequestException("Justificativa de ressalva obrigatória");
    }

    const procedimento = data.procedimentoId
      ? await this.prisma.procedimentoLaudo.findFirst({
          where: { id: data.procedimentoId, estabelecimentoId: user.estabelecimentoId },
        })
      : null;

    const dataExecucao = new Date();
    const instrumentoSnap = data.instrumentoId
      ? await this.montarInstrumentoSnapshot(user.estabelecimentoId, data.instrumentoId, dataExecucao, true)
      : null;

    const modeloItens = (procedimento?.itens as ItemChecklistModelo[] | undefined) ?? [];
    const respostas = this.avaliarRespostas(data.tipo, data.respostas ?? [], modeloItens, instrumentoSnap);
    const resultadoCalc = calcularResultadoLaudo(data.tipo, respostas) as ResultadoLaudo;
    const resultado = data.resultado ?? resultadoCalc;
    this.assertConformidadePublicada(data.resultado, resultadoCalc);

    const planoTeste =
      equipamento.tipoEquipamentoPlanoId &&
      (data.tipo === TipoLaudo.PREVENTIVA ||
        data.tipo === TipoLaudo.CALIBRACAO ||
        data.tipo === TipoLaudo.TSE ||
        data.tipo === TipoLaudo.QUALIFICACAO)
        ? await this.prisma.planoTeste.findUnique({
            where: {
              tipoEquipamentoPlanoId_tipoTeste: {
                tipoEquipamentoPlanoId: equipamento.tipoEquipamentoPlanoId,
                tipoTeste: data.tipo,
              },
            },
          })
        : null;

    const validadeMeses =
      data.validadeMeses ?? planoTeste?.periodicidadeMeses ?? procedimento?.validadeMeses ?? 12;

    const numero = await this.nextNumero(user.estabelecimentoId, data.tipo);
    const procSnap = procedimento
      ? {
          id: procedimento.id,
          nome: procedimento.nome,
          tipo: procedimento.tipo,
          versao: procedimento.versao,
          validadeMeses: procedimento.validadeMeses,
          itens: procedimento.itens,
          criterioReferencia: procedimento.criterioReferencia,
          criterioVersao: procedimento.criterioVersao,
        }
      : { itens: modeloItens };

    const laudo = await this.prisma.laudo.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        tipo: data.tipo,
        numero,
        equipamentoId: equipamento.id,
        osNumero: data.osNumero,
        dataExecucao,
        tecnicoNome: data.tecnicoNome,
        responsavelTecnicoId: data.responsavelTecnicoId,
        procedimentoId: data.procedimentoId,
        instrumentoId: data.instrumentoId,
        planoTesteId: planoTeste?.id,
        resultado,
        justificativaRessalva: data.justificativaRessalva,
        validadeMeses,
        validadeAte: null,
        respostas: respostas as object[],
        metadados: (data.metadados ?? {}) as object,
        statusDocumento: StatusDocumentoLaudo.RASCUNHO,
        procedimentoVersao: procedimento?.versao ?? null,
        procedimentoSnapshot: procSnap as object,
        instrumentoSnapshot: instrumentoSnap as object | undefined,
      },
      include: { equipamento: true, procedimento: true },
    });

    return laudo;
  }

  async atualizarRascunho(
    user: AuthUser,
    id: string,
    data: {
      respostas?: RespostaItem[];
      metadados?: Record<string, unknown>;
      instrumentoId?: string;
      tecnicoNome?: string;
      responsavelTecnicoId?: string;
      osNumero?: number;
      justificativaRessalva?: string;
    },
  ) {
    const laudo = await this.prisma.laudo.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
      include: { procedimento: true },
    });
    if (!laudo) throw new NotFoundException();
    if (laudo.statusDocumento === StatusDocumentoLaudo.FINAL) {
      throw new BadRequestException("Documento final não se altera em silêncio. Use retificação com justificativa.");
    }

    const modeloItens = this.itensDoModelo(laudo.procedimentoSnapshot, laudo.procedimento?.itens);

    let instrumentoSnap = laudo.instrumentoSnapshot;
    if (data.instrumentoId) {
      instrumentoSnap = await this.montarInstrumentoSnapshot(
        user.estabelecimentoId,
        data.instrumentoId,
        laudo.dataExecucao,
        true,
      );
    }

    const respostas = this.avaliarRespostas(
      laudo.tipo,
      data.respostas ?? ((laudo.respostas as RespostaItem[]) ?? []),
      modeloItens,
      instrumentoSnap,
    );
    const resultado = calcularResultadoLaudo(laudo.tipo, respostas) as ResultadoLaudo;
    const meta = { ...((laudo.metadados as Record<string, unknown>) ?? {}), ...(data.metadados ?? {}) };

    return this.prisma.laudo.update({
      where: { id },
      data: {
        respostas: respostas as object[],
        resultado,
        metadados: meta as object,
        ...(data.instrumentoId != null ? { instrumentoId: data.instrumentoId, instrumentoSnapshot: instrumentoSnap as object } : {}),
        ...(data.tecnicoNome != null ? { tecnicoNome: data.tecnicoNome } : {}),
        ...(data.responsavelTecnicoId != null ? { responsavelTecnicoId: data.responsavelTecnicoId } : {}),
        ...(data.osNumero != null ? { osNumero: data.osNumero } : {}),
        ...(data.justificativaRessalva != null ? { justificativaRessalva: data.justificativaRessalva } : {}),
      },
      include: { equipamento: true, procedimento: true },
    });
  }

  async finalizar(user: AuthUser, id: string) {
    if (!temPermissao(user.permissoesModulos, "laudos", PERMISSAO_NIVEL.EDICAO_APROVACAO)) {
      throw new ForbiddenException("Só pessoa autorizada finaliza o relatório de serviço");
    }
    const laudo = await this.prisma.laudo.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
      include: { equipamento: true, planoTeste: true, procedimento: true },
    });
    if (!laudo) throw new NotFoundException();
    if (laudo.statusDocumento === StatusDocumentoLaudo.FINAL) {
      throw new BadRequestException("Relatório já está final");
    }

    const modeloItens = this.itensDoModelo(laudo.procedimentoSnapshot, laudo.procedimento?.itens);
    const respostas = this.avaliarRespostas(
      laudo.tipo,
      (laudo.respostas as RespostaItem[]) ?? [],
      modeloItens,
      laudo.instrumentoSnapshot,
    );
    const resultado = calcularResultadoLaudo(laudo.tipo, respostas) as ResultadoLaudo;
    const pendentes = itensObrigatoriosPendentes(respostas, modeloItens);
    if (pendentes.length) {
      throw new BadRequestException(`Itens obrigatórios sem resposta: ${pendentes.slice(0, 5).join("; ")}`);
    }
    if (resultado === ResultadoLaudo.APROVADO_COM_RESSALVAS && !laudo.justificativaRessalva?.trim()) {
      throw new BadRequestException("Justificativa de ressalva obrigatória");
    }

    const autor = await this.autorNome(user);
    const validadeMeses = laudo.validadeMeses ?? laudo.planoTeste?.periodicidadeMeses ?? laudo.procedimento?.validadeMeses ?? 12;
    const validadeAte = new Date();
    validadeAte.setMonth(validadeAte.getMonth() + validadeMeses);
    const comValidade =
      resultado === ResultadoLaudo.APROVADO || resultado === ResultadoLaudo.APROVADO_COM_RESSALVAS;

    const updated = await this.prisma.laudo.update({
      where: { id },
      data: {
        respostas: respostas as object[],
        resultado,
        statusDocumento: StatusDocumentoLaudo.FINAL,
        finalizadoPorId: user.userId,
        finalizadoPorNome: autor,
        finalizadoEm: new Date(),
        validadeMeses,
        validadeAte: comValidade ? validadeAte : null,
      },
      include: { equipamento: true, procedimento: true },
    });

    if (
      laudo.tipo === TipoLaudo.RECEBIMENTO &&
      (resultado === ResultadoLaudo.APROVADO || resultado === ResultadoLaudo.APROVADO_COM_RESSALVAS)
    ) {
      await this.prisma.equipamento.update({
        where: { id: laudo.equipamentoId },
        data: { checklistRecebimentoPendente: false },
      });
    }

    if (
      laudo.tipo === TipoLaudo.PREVENTIVA ||
      laudo.tipo === TipoLaudo.CALIBRACAO ||
      laudo.tipo === TipoLaudo.TSE ||
      laudo.tipo === TipoLaudo.QUALIFICACAO
    ) {
      await agendarProximaOsPlano(this.prisma, {
        estabelecimentoId: user.estabelecimentoId,
        equipamentoId: laudo.equipamentoId,
        tipo: laudo.tipo,
        dataExecucao: laudo.dataExecucao,
        periodicidadeMeses: laudo.planoTeste?.periodicidadeMeses ?? 0,
        resultado: resultado ?? ResultadoLaudo.NAO_AVALIADO,
        observacao: laudo.planoTeste
          ? `Próxima ${laudo.tipo} · ${laudo.planoTeste.procedimentoCodigo}`
          : undefined,
        osNumero: laudo.osNumero,
        laudoId: laudo.id,
        checklist: respostas,
        executorNome: laudo.tecnicoNome,
        executorId: laudo.responsavelTecnicoId,
        usuarioId: user.userId,
      });
    }

    return updated;
  }

  async retificar(
    user: AuthUser,
    id: string,
    data: { justificativa: string; respostas?: RespostaItem[]; resultado?: ResultadoLaudo; justificativaRessalva?: string },
  ) {
    if (!temPermissao(user.permissoesModulos, "laudos", PERMISSAO_NIVEL.EDICAO_APROVACAO)) {
      throw new ForbiddenException("Só pessoa autorizada retifica relatório final");
    }
    if (!data.justificativa?.trim()) throw new BadRequestException("Justificativa de retificação obrigatória");
    const laudo = await this.prisma.laudo.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
      include: { procedimento: true },
    });
    if (!laudo) throw new NotFoundException();
    if (laudo.statusDocumento !== StatusDocumentoLaudo.FINAL) {
      throw new BadRequestException("Retificação aplica-se a documento final");
    }

    const modeloItens = this.itensDoModelo(laudo.procedimentoSnapshot, laudo.procedimento?.itens);
    const respostas = data.respostas
      ? this.avaliarRespostas(laudo.tipo, data.respostas, modeloItens, laudo.instrumentoSnapshot)
      : ((laudo.respostas as RespostaItem[]) ?? []);
    const resultadoCalc = calcularResultadoLaudo(laudo.tipo, respostas) as ResultadoLaudo;
    this.assertConformidadePublicada(data.resultado, resultadoCalc);
    const resultado = data.resultado ?? resultadoCalc;
    const autor = await this.autorNome(user);

    await this.prisma.laudoRevisao.create({
      data: {
        laudoId: laudo.id,
        autorId: user.userId,
        autorNome: autor,
        justificativa: data.justificativa.trim(),
        respostasAntes: laudo.respostas as object,
        respostasDepois: respostas as object[],
        resultadoAntes: laudo.resultado,
        resultadoDepois: resultado,
        statusAntes: laudo.statusDocumento,
        statusDepois: StatusDocumentoLaudo.FINAL,
      },
    });

    return this.prisma.laudo.update({
      where: { id },
      data: {
        respostas: respostas as object[],
        resultado,
        justificativaRessalva: data.justificativaRessalva ?? laudo.justificativaRessalva,
      },
      include: { equipamento: true, procedimento: true, revisoes: { orderBy: { createdAt: "desc" } } },
    });
  }

  async setVisivelPortal(user: AuthUser, id: string, visivel: boolean) {
    if (!temPermissao(user.permissoesModulos, "laudos", PERMISSAO_NIVEL.EDICAO_APROVACAO)) {
      throw new ForbiddenException("Só pessoa autorizada libera o relatório ao solicitante");
    }
    const laudo = await this.prisma.laudo.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!laudo) throw new NotFoundException();
    if (visivel && laudo.statusDocumento !== StatusDocumentoLaudo.FINAL) {
      throw new BadRequestException("Só relatório final pode ser autorizado no portal");
    }
    return this.prisma.laudo.update({
      where: { id },
      data: { visivelPortal: visivel },
      select: { id: true, visivelPortal: true, statusDocumento: true, numero: true },
    });
  }

  async promoverAssinatura(
    user: AuthUser,
    id: string,
    data: {
      resultado: ResultadoLaudo;
      justificativaRessalva?: string;
      validadeMeses?: number;
    },
  ) {
    if (
      data.resultado !== ResultadoLaudo.APROVADO &&
      data.resultado !== ResultadoLaudo.APROVADO_COM_RESSALVAS
    ) {
      throw new BadRequestException("Resultado deve ser APROVADO ou APROVADO_COM_RESSALVAS");
    }
    if (
      data.resultado === ResultadoLaudo.APROVADO_COM_RESSALVAS &&
      !data.justificativaRessalva?.trim()
    ) {
      throw new BadRequestException("Justificativa de ressalva obrigatória");
    }

    const laudo = await this.prisma.laudo.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
      include: { equipamento: true, planoTeste: true, procedimento: true },
    });
    if (!laudo) throw new NotFoundException();
    if (laudo.resultado !== ResultadoLaudo.PENDENTE_ASSINATURA) {
      throw new BadRequestException("Laudo não está pendente de assinatura");
    }
    const calc = calcularResultadoLaudo(laudo.tipo, (laudo.respostas as RespostaItem[]) ?? []);
    this.assertConformidadePublicada(data.resultado, calc);

    const validadeMeses =
      data.validadeMeses ??
      laudo.validadeMeses ??
      laudo.planoTeste?.periodicidadeMeses ??
      laudo.procedimento?.validadeMeses ??
      12;
    const validadeAte = new Date();
    validadeAte.setMonth(validadeAte.getMonth() + validadeMeses);

    const meta = (laudo.metadados as Record<string, unknown>) ?? {};
    const autor = await this.autorNome(user);
    const updated = await this.prisma.laudo.update({
      where: { id },
      data: {
        resultado: data.resultado,
        justificativaRessalva: data.justificativaRessalva?.trim() || null,
        validadeMeses,
        validadeAte,
        statusDocumento: StatusDocumentoLaudo.FINAL,
        finalizadoPorId: user.userId,
        finalizadoPorNome: autor,
        finalizadoEm: new Date(),
        metadados: {
          ...meta,
          assinaturaPromovida: {
            em: new Date().toISOString(),
            por: user.userId,
          },
        },
      },
      include: { equipamento: true, procedimento: true },
    });

    if (
      laudo.tipo === TipoLaudo.RECEBIMENTO &&
      (data.resultado === ResultadoLaudo.APROVADO ||
        data.resultado === ResultadoLaudo.APROVADO_COM_RESSALVAS)
    ) {
      await this.prisma.equipamento.update({
        where: { id: laudo.equipamentoId },
        data: { checklistRecebimentoPendente: false },
      });
    }

    if (
      laudo.tipo === TipoLaudo.PREVENTIVA ||
      laudo.tipo === TipoLaudo.CALIBRACAO ||
      laudo.tipo === TipoLaudo.TSE ||
      laudo.tipo === TipoLaudo.QUALIFICACAO
    ) {
      await agendarProximaOsPlano(this.prisma, {
        estabelecimentoId: user.estabelecimentoId,
        equipamentoId: laudo.equipamentoId,
        tipo: laudo.tipo,
        dataExecucao: laudo.dataExecucao,
        periodicidadeMeses: laudo.planoTeste?.periodicidadeMeses ?? 0,
        resultado: data.resultado,
        observacao: laudo.planoTeste
          ? `Próxima ${laudo.tipo} · ${laudo.planoTeste.procedimentoCodigo}`
          : undefined,
        osNumero: laudo.osNumero,
        laudoId: laudo.id,
        executorId: laudo.responsavelTecnicoId,
        usuarioId: user.userId,
      });
    }

    return updated;
  }

  async gerarOsCorretiva(user: AuthUser, laudoId: string) {
    const laudo = await this.byId(user.estabelecimentoId, laudoId);
    const respostas = (laudo.respostas as RespostaItem[]) ?? [];
    const problemas = respostas.filter(
      (r) =>
        r.status === "NAO" ||
        r.status === "REPROVADO" ||
        (typeof r.erroPct === "number" &&
          typeof r.limite === "number" &&
          Math.abs(r.erroPct) > r.limite),
    );

    if (problemas.length === 0) {
      throw new BadRequestException("Não há não-conformidades para gerar OS");
    }

    const descricao = problemas
      .map((p, i) => `${i + 1}. ${p.pergunta ?? "Item"} — ${p.observacao ?? p.status ?? "NC"}`)
      .join("\n");

    const os = await this.os.create(user, {
      equipamentoTag: laudo.equipamento.tag,
      tipo: TipoOS.CORRETIVA,
      prioridade: PrioridadeOS.ALTA,
      observacaoRequisicao: `OS corretiva gerada a partir do laudo ${laudo.numero}:\n${descricao}`,
    });

    return { laudoId: laudo.id, problemas: problemas.length, os };
  }

  async fichaVida(estabelecimentoId: string, tag: string) {
    const eq = await this.prisma.equipamento.findUnique({
      where: { estabelecimentoId_tag: { estabelecimentoId, tag } },
      include: {
        descricao: true,
        ordensServico: {
          include: { itens: true },
          orderBy: { abertura: "asc" },
        },
        laudos: { orderBy: { dataExecucao: "desc" } },
      },
    });
    if (!eq) throw new NotFoundException();

    const corretivas = eq.ordensServico.filter((o) => o.tipo === TipoOS.CORRETIVA && o.fechamento);
    let mtbf: number | null = null;
    let mttf: number | null = null;
    if (corretivas.length >= 2) {
      const intervalos: number[] = [];
      for (let i = 1; i < corretivas.length; i++) {
        const ms =
          corretivas[i].abertura.getTime() - corretivas[i - 1].abertura.getTime();
        intervalos.push(ms / (1000 * 60 * 60 * 24));
      }
      mtbf = Number((intervalos.reduce((a, b) => a + b, 0) / intervalos.length).toFixed(1));
    }
    if (eq.dataAquisicao && corretivas.length >= 1) {
      const dias =
        (corretivas[0].abertura.getTime() - eq.dataAquisicao.getTime()) / (1000 * 60 * 60 * 24);
      mttf = Number(Math.max(0, dias).toFixed(1));
    }

    const valorAquisicao = Number(eq.valorAquisicao ?? 0);
    const vida = eq.descricao.vidaUtilAnos || 10;
    let valorDepreciado: number | null = null;
    if (eq.dataAquisicao && valorAquisicao > 0) {
      const anos =
        (Date.now() - eq.dataAquisicao.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      valorDepreciado = Math.max(
        0,
        Number((valorAquisicao - (valorAquisicao / vida) * anos).toFixed(2)),
      );
    }

    const totalOS = eq.ordensServico.reduce((acc, os) => {
      return (
        acc +
        os.itens.reduce((s, item) => s + Number(item.quantidade) * Number(item.valorUnitario ?? 0), 0)
      );
    }, 0);

    const totalContrato = await this.contratos.rateioPorEquipamento(
      estabelecimentoId,
      eq.id,
    );
    const nContratos = await this.prisma.contratoEquipamento.count({
      where: { equipamentoId: eq.id },
    });

    return {
      equipamento: {
        tag: eq.tag,
        nome: eq.nome,
        criticidade: eq.descricao.criticidade,
        vidaUtilAnos: vida,
      },
      confiabilidade: {
        mtbf: mtbf ?? "sem dados",
        mttf: mttf ?? "sem dados",
      },
      depreciacao: {
        valorAquisicao: valorAquisicao || null,
        valorDepreciado,
      },
      custos: {
        totalOS: Number(totalOS.toFixed(2)),
        totalContrato: Number(totalContrato.toFixed(2)),
        nOS: eq.ordensServico.length,
        nContratos,
      },
      historico: [
        ...eq.ordensServico.map((o) => ({
          tipo: "OS",
          ref: o.codigo,
          data: o.abertura,
          detalhe: [o.status, o.servicoRealizado, o.condicaoFinal].filter(Boolean).join(" · "),
        })),
        ...eq.laudos.map((l) => ({
          tipo: "LAUDO",
          ref: l.numero,
          data: l.dataExecucao,
          detalhe: `${l.tipo} · ${l.resultado ?? "—"}`,
        })),
      ].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()),
    };
  }

  async historicoEquipamento(estabelecimentoId: string, tag: string) {
    const ficha = await this.fichaVida(estabelecimentoId, tag);
    return ficha.historico;
  }

  certificados(estabelecimentoId: string, tipo?: TipoLaudo) {
    const tipos: TipoLaudo[] = tipo
      ? [tipo]
      : [TipoLaudo.CALIBRACAO, TipoLaudo.TSE];

    return this.prisma.laudo
      .findMany({
        where: {
          estabelecimentoId,
          tipo: { in: tipos },
          statusDocumento: StatusDocumentoLaudo.FINAL,
          resultado: { in: [ResultadoLaudo.APROVADO, ResultadoLaudo.APROVADO_COM_RESSALVAS] },
        },
        include: {
          equipamento: { include: { setor: true } },
          anexos: { select: { id: true, nomeArquivo: true } },
        },
        orderBy: { validadeAte: "asc" },
      })
      .then((rows) =>
        rows.map((l) => ({
          ...l,
          temAnexoOriginal: (l.anexos?.length ?? 0) > 0,
          statusCertificado: this.statusCertificado(l.validadeAte),
        })),
      );
  }

  async certificadoDocumento(estabelecimentoId: string, id: string) {
    const l = await this.prisma.laudo.findFirst({
      where: { id, estabelecimentoId },
      include: {
        equipamento: { include: { setor: true, fabricante: true, modelo: true } },
        procedimento: true,
        responsavelTecnico: true,
        anexos: { select: { id: true, nomeArquivo: true, mimeType: true } },
      },
    });
    if (!l) throw new NotFoundException("Documento não encontrado");
    const docTitle = tituloDocumentoTecnico(l.tipo);
    return {
      ...l,
      statusCertificado: this.statusCertificado(l.validadeAte),
      documento: {
        titulo: `${docTitle.titulo} · ${docTitle.subtipo} ${l.numero}`,
        emitidoEm: l.dataExecucao,
        validadeAte: l.validadeAte,
        equipamento: `${l.equipamento.tag} — ${l.equipamento.nome}`,
        setor: l.equipamento.setor.nome,
        resultado: l.resultado,
        procedimento: l.procedimento?.nome,
        responsavel: l.responsavelTecnico?.nome,
        respostas: l.respostas,
        anexos: l.anexos,
        naoECertificadoCalibracao: true,
      },
    };
  }

  async certificadoPdfOriginal(estabelecimentoId: string, id: string) {
    const l = await this.prisma.laudo.findFirst({
      where: { id, estabelecimentoId },
      include: {
        anexos: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!l) throw new NotFoundException("Certificado não encontrado");
    const anexo = l.anexos[0];
    if (!anexo) return null;
    return {
      nomeArquivo: anexo.nomeArquivo,
      mimeType: anexo.mimeType,
      conteudo: anexo.conteudo,
    };
  }

  async reabrirCertificado(user: AuthUser, id: string, justificativa: string) {
    if (!temPermissao(user.permissoesModulos, "laudos", PERMISSAO_NIVEL.EDICAO_APROVACAO)) {
      throw new ForbiddenException("Sem permissão para reabrir certificado");
    }
    if (!justificativa?.trim()) throw new BadRequestException("Justificativa obrigatória");
    const l = await this.prisma.laudo.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!l) throw new NotFoundException("Documento não encontrado");
    const meta = (l.metadados as Record<string, unknown>) ?? {};
    const autor = await this.autorNome(user);
    await this.prisma.laudoRevisao.create({
      data: {
        laudoId: l.id,
        autorId: user.userId,
        autorNome: autor,
        justificativa: justificativa.trim(),
        resultadoAntes: l.resultado,
        resultadoDepois: null,
        statusAntes: l.statusDocumento,
        statusDepois: StatusDocumentoLaudo.RASCUNHO,
      },
    });
    return this.prisma.laudo.update({
      where: { id },
      data: {
        resultado: null,
        validadeAte: null,
        statusDocumento: StatusDocumentoLaudo.RASCUNHO,
        visivelPortal: false,
        metadados: {
          ...meta,
          reabertura: {
            em: new Date().toISOString(),
            por: user.userId,
            justificativa: justificativa.trim(),
          },
        },
      },
    });
  }

  async payloadRelatorio(estabelecimentoId: string, id: string): Promise<RelatorioServicoPayload> {
    const l = await this.prisma.laudo.findFirst({
      where: { id, estabelecimentoId },
      include: {
        equipamento: { include: { setor: true, fabricante: true, modelo: true } },
        procedimento: true,
        instrumento: true,
        responsavelTecnico: true,
        anexos: { select: { nomeArquivo: true } },
        revisoes: { orderBy: { createdAt: "desc" } },
        estabelecimento: { select: { nome: true, cnpj: true } },
      },
    });
    if (!l) throw new NotFoundException("Relatório não encontrado");
    const snap = (l.instrumentoSnapshot ?? {}) as {
      nome?: string;
      identificacao?: string;
      nSerie?: string;
      tipoAnalisador?: string | null;
      certificado?: RelatorioServicoPayload["instrumento"] extends infer T
        ? T extends { certificado?: infer C }
          ? C
          : never
        : never;
    };
    const respostas = ((l.respostas as RespostaItem[]) ?? []).map((r) => ({
      secao: r.secao,
      pergunta: r.pergunta,
      tipo: r.tipo,
      status: r.status,
      unidade: r.unidade,
      grandeza: r.grandeza,
      valorReferencia: r.valorReferencia ?? r.valorConfigurado,
      valorMedido: r.valorMedido ?? r.media,
      leituras: r.leituras,
      erroAbs: r.erroAbs,
      erroPct: r.erroPct,
      limite: r.limite,
      toleranciaTexto: r.toleranciaTexto,
      observacao: r.observacao,
    }));
    const executores: RelatorioServicoPayload["executores"] = [];
    if (l.responsavelTecnico?.nome) {
      executores.push({
        papel: "Responsável técnico",
        nome: l.responsavelTecnico.nome,
        registro: l.responsavelTecnico.registroProfissional,
      });
    }
    if (l.tecnicoNome) executores.push({ papel: "Executor", nome: l.tecnicoNome });
    if (l.finalizadoPorNome) executores.push({ papel: "Finalizado por", nome: l.finalizadoPorNome });

    return {
      instituicao: { nome: l.estabelecimento.nome, cnpj: l.estabelecimento.cnpj },
      numero: l.numero,
      tipo: l.tipo,
      statusDocumento: l.statusDocumento,
      dataExecucao: l.dataExecucao,
      osNumero: l.osNumero,
      equipamento: {
        tag: l.equipamento.tag,
        nome: l.equipamento.nome,
        setor: l.equipamento.setor.nome,
        fabricante: l.equipamento.fabricante?.nome,
        modelo: l.equipamento.modelo?.nome,
        nSerie: l.equipamento.nSerie,
      },
      executores,
      procedimento: this.procedimentoDoSnapshot(l.procedimentoSnapshot, l.procedimento, l.procedimentoVersao),
      respostas,
      instrumento: snap.nome
        ? {
            nome: snap.nome,
            identificacao: snap.identificacao,
            nSerie: snap.nSerie,
            tipoAnalisador: snap.tipoAnalisador,
            certificado: snap.certificado ?? null,
          }
        : l.instrumento
          ? { nome: l.instrumento.nome, nSerie: l.instrumento.nSerie, identificacao: l.instrumento.nSerie }
          : null,
      resultado: l.resultado,
      justificativaRessalva: l.justificativaRessalva,
      anexos: l.anexos,
      revisoes: l.revisoes.map((r) => ({
        autorNome: r.autorNome,
        createdAt: r.createdAt,
        justificativa: r.justificativa,
      })),
      finalizadoPorNome: l.finalizadoPorNome,
      finalizadoEm: l.finalizadoEm,
      visivelPortal: l.visivelPortal,
    };
  }

  async relatorioPdf(estabelecimentoId: string, id: string) {
    const payload = await this.payloadRelatorio(estabelecimentoId, id);
    const pdf = await buildRelatorioServicoPdf(payload);
    const nome = `${tituloDocumentoTecnico(payload.tipo).filenamePrefix}-${payload.numero}.pdf`;
    return { pdf, nome, payload };
  }

  private statusCertificado(validadeAte: Date | null, diasAlerta = 60) {
    return statusCertificadoNaData(validadeAte, new Date(), diasAlerta);
  }

  private calcularResultado(tipo: TipoLaudo, respostas: RespostaItem[]): ResultadoLaudo {
    return calcularResultadoLaudo(tipo, respostas) as ResultadoLaudo;
  }

  private itensDoModelo(snapshot: unknown, fallback: unknown): ItemChecklistModelo[] {
    if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
      const itens = (snapshot as { itens?: ItemChecklistModelo[] }).itens;
      if (Array.isArray(itens)) return itens;
    }
    return Array.isArray(fallback) ? (fallback as ItemChecklistModelo[]) : [];
  }

  private procedimentoDoSnapshot(
    snapshot: unknown,
    procedimento: { nome: string } | null,
    versao: number | null,
  ): { nome: string; versao?: number | null } | null {
    if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
      const s = snapshot as { nome?: string; versao?: number | null };
      if (s.nome) return { nome: s.nome, versao: s.versao ?? versao };
    }
    return procedimento ? { nome: procedimento.nome, versao } : null;
  }

  private assertConformidadePublicada(
    solicitado: ResultadoLaudo | undefined,
    calculado: ResultadoLaudo | string,
  ) {
    const declara =
      solicitado === ResultadoLaudo.APROVADO || solicitado === ResultadoLaudo.APROVADO_COM_RESSALVAS;
    if (declara && calculado === ResultadoLaudo.NAO_AVALIADO) {
      throw new BadRequestException(
        "Não é possível declarar conformidade sem critério de aceitação publicado (referência e versão)",
      );
    }
  }

  private avaliarRespostas(
    tipo: TipoLaudo,
    respostas: RespostaItem[],
    modelo: ItemChecklistModelo[],
    instrumentoSnap: unknown,
  ): RespostaItem[] {
    const pontos =
      (instrumentoSnap as { certificado?: { pontos?: ItemChecklistModelo[] } } | null)?.certificado?.pontos ?? [];
    return respostas.map((r) => {
      const item = modelo.find((m) => m.id && m.id === r.id);
      const isCal =
        r.tipo === "calibracao" ||
        item?.tipo === "calibracao" ||
        (tipo === TipoLaudo.CALIBRACAO && (r.valorConfigurado != null || (r.leituras?.length ?? 0) > 0) && r.tipo !== "check" && r.tipo !== "medicao");
      if (isCal) {
        return avaliarPontoCalibracao({
          itemModelo: item,
          resposta: { ...r, origemMedicao: r.origemMedicao ?? "MANUAL" },
          pontosCertificado: pontos as never,
        });
      }
      if ((r.tipo === "medicao" || tipo === TipoLaudo.TSE) && r.tipo !== "check") {
        const avaliado = avaliarPontoCalibracao({
          itemModelo: item,
          resposta: { ...r, origemMedicao: "MANUAL" },
          pontosCertificado: pontos as never,
        });
        return avaliado;
      }
      return { ...r, origemMedicao: r.origemMedicao ?? "MANUAL" };
    });
  }

  private async montarInstrumentoSnapshot(
    estabelecimentoId: string,
    instrumentoId: string,
    dataServico: Date,
    bloquearSePolitica: boolean,
  ) {
    const org = await this.prisma.estabelecimento.findUnique({
      where: { id: estabelecimentoId },
      select: { diasAlertaCertificado: true, bloquearPadraoVencido: true },
    });
    const diasAlerta = org?.diasAlertaCertificado ?? 60;
    const inst = await this.prisma.instrumentoPadrao.findFirst({
      where: { id: instrumentoId, estabelecimentoId, ativo: true },
      include: {
        certificados: { include: { pontos: { orderBy: { ordem: "asc" } } }, orderBy: { dataEmissao: "desc" } },
      },
    });
    if (!inst) throw new NotFoundException("Instrumento padrão não encontrado");
    const snap = snapshotInstrumentoNaData({
      instrumento: inst,
      certificados: inst.certificados,
      dataServico,
      diasAlerta,
    });
    const st = snap.certificado?.statusNaData ?? "SEM_CERTIFICADO";
    if (bloquearSePolitica && org?.bloquearPadraoVencido !== false && (st === "VENCIDO" || st === "SEM_CERTIFICADO")) {
      throw new ForbiddenException(
        st === "VENCIDO"
          ? "Instrumento com certificado vencido na data do serviço — política do hospital impede o uso"
          : "Instrumento sem certificado na data do serviço",
      );
    }
    const pontos = snap.certificado?.pontos?.length ?? 0;
    if (pontos <= 0) {
      throw new ForbiddenException(
        "Instrumento sem pontos de calibração (U) no certificado da data do serviço — cadastre o certificado do padrão com pontos antes de usar",
      );
    }
    return snap;
  }

  private async autorNome(user: AuthUser) {
    const u = await this.prisma.usuario.findUnique({ where: { id: user.userId }, select: { nome: true } });
    return u?.nome || user.email;
  }

  private async nextNumero(estabelecimentoId: string, tipo: TipoLaudo) {
    const chave = `LAUDO_${tipo}`;
    const row = await this.prisma.contadorSequencia.upsert({
      where: { estabelecimentoId_chave: { estabelecimentoId, chave } },
      create: { estabelecimentoId, chave, valor: 1 },
      update: { valor: { increment: 1 } },
    });
    const prefix =
      tipo === TipoLaudo.RECEBIMENTO
        ? "LR"
        : tipo === TipoLaudo.PREVENTIVA
          ? "LP"
          : tipo === TipoLaudo.CALIBRACAO
            ? "LC"
            : "LT";
    return `${prefix}-${String(row.valor).padStart(5, "0")}`;
  }
}
