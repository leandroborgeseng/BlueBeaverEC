import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrioridadeOS, ResultadoLaudo, TipoLaudo, TipoOS } from "@prisma/client";
import { PERMISSAO_NIVEL, temPermissao } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import { OsService } from "../os/os.service";
import { ContratosService } from "../contratos/contratos.service";
import type { AuthUser } from "../auth/current-user.decorator";
import { agendarProximaOsPlano, resultadoFechaCiclo } from "../planos/proxima-os-plano";

type RespostaItem = {
  id?: string;
  pergunta?: string;
  valor?: string | number | boolean | null;
  status?: "SIM" | "NAO" | "NA" | "APROVADO" | "REPROVADO" | string;
  observacao?: string;
  valorPadrao?: number;
  valorMedido?: number;
  erroPct?: number;
  limite?: number;
};

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
        equipamento: { include: { modelo: true, fabricante: true, descricao: true } },
        procedimento: true,
        instrumento: true,
        responsavelTecnico: true,
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
      if (data.instrumentoId) {
        await this.assertInstrumentoValido(user.estabelecimentoId, data.instrumentoId);
      }
    }

    if (data.resultado === ResultadoLaudo.APROVADO_COM_RESSALVAS && !data.justificativaRessalva?.trim()) {
      throw new BadRequestException("Justificativa de ressalva obrigatória");
    }

    const respostas = data.respostas ?? [];
    const resultado =
      data.resultado ?? this.calcularResultado(data.tipo, respostas, data.metadados);

    const procedimento = data.procedimentoId
      ? await this.prisma.procedimentoLaudo.findFirst({
          where: { id: data.procedimentoId, estabelecimentoId: user.estabelecimentoId },
        })
      : null;

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
    const validadeAte = new Date();
    validadeAte.setMonth(validadeAte.getMonth() + validadeMeses);

    const numero = await this.nextNumero(user.estabelecimentoId, data.tipo);

    const laudo = await this.prisma.laudo.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        tipo: data.tipo,
        numero,
        equipamentoId: equipamento.id,
        osNumero: data.osNumero,
        tecnicoNome: data.tecnicoNome,
        responsavelTecnicoId: data.responsavelTecnicoId,
        procedimentoId: data.procedimentoId,
        instrumentoId: data.instrumentoId,
        planoTesteId: planoTeste?.id,
        resultado,
        justificativaRessalva: data.justificativaRessalva,
        validadeMeses,
        validadeAte: resultado === ResultadoLaudo.PENDENTE_ASSINATURA ? null : validadeAte,
        respostas: respostas as object[],
        metadados: (data.metadados ?? {}) as object,
      },
      include: { equipamento: true, procedimento: true },
    });

    if (
      data.tipo === TipoLaudo.RECEBIMENTO &&
      (resultado === ResultadoLaudo.APROVADO ||
        resultado === ResultadoLaudo.APROVADO_COM_RESSALVAS)
    ) {
      await this.prisma.equipamento.update({
        where: { id: equipamento.id },
        data: { checklistRecebimentoPendente: false },
      });
    }

    if (resultadoFechaCiclo(resultado) && planoTeste) {
      await agendarProximaOsPlano(this.prisma, {
        estabelecimentoId: user.estabelecimentoId,
        equipamentoId: equipamento.id,
        tipo: data.tipo,
        dataExecucao: laudo.dataExecucao,
        periodicidadeMeses: planoTeste.periodicidadeMeses,
        resultado,
        observacao: `Próxima ${data.tipo} · ${planoTeste.procedimentoCodigo}`,
      });
    }

    return laudo;
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

    const validadeMeses =
      data.validadeMeses ??
      laudo.validadeMeses ??
      laudo.planoTeste?.periodicidadeMeses ??
      laudo.procedimento?.validadeMeses ??
      12;
    const validadeAte = new Date();
    validadeAte.setMonth(validadeAte.getMonth() + validadeMeses);

    const meta = (laudo.metadados as Record<string, unknown>) ?? {};
    const updated = await this.prisma.laudo.update({
      where: { id },
      data: {
        resultado: data.resultado,
        justificativaRessalva: data.justificativaRessalva?.trim() || null,
        validadeMeses,
        validadeAte,
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

    if (resultadoFechaCiclo(data.resultado) && laudo.planoTeste) {
      await agendarProximaOsPlano(this.prisma, {
        estabelecimentoId: user.estabelecimentoId,
        equipamentoId: laudo.equipamentoId,
        tipo: laudo.tipo,
        dataExecucao: laudo.dataExecucao,
        periodicidadeMeses: laudo.planoTeste.periodicidadeMeses,
        resultado: data.resultado,
        observacao: `Próxima ${laudo.tipo} · ${laudo.planoTeste.procedimentoCodigo}`,
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
          detalhe: o.status,
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
    if (!l) throw new NotFoundException("Certificado não encontrado");
    return {
      ...l,
      statusCertificado: this.statusCertificado(l.validadeAte),
      documento: {
        titulo: `Certificado ${l.tipo} ${l.numero}`,
        emitidoEm: l.dataExecucao,
        validadeAte: l.validadeAte,
        equipamento: `${l.equipamento.tag} — ${l.equipamento.nome}`,
        setor: l.equipamento.setor.nome,
        resultado: l.resultado,
        procedimento: l.procedimento?.nome,
        responsavel: l.responsavelTecnico?.nome,
        respostas: l.respostas,
        anexos: l.anexos,
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
    if (!l) throw new NotFoundException("Certificado não encontrado");
    const meta = (l.metadados as Record<string, unknown>) ?? {};
    return this.prisma.laudo.update({
      where: { id },
      data: {
        resultado: null,
        validadeAte: null,
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

  private statusCertificado(validadeAte: Date | null) {
    if (!validadeAte) return "VALIDO";
    const dias = (validadeAte.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (dias < 0) return "VENCIDO";
    if (dias <= 60) return "A_VENCER";
    return "VALIDO";
  }

  private calcularResultado(
    tipo: TipoLaudo,
    respostas: RespostaItem[],
    _meta?: Record<string, unknown>,
  ): ResultadoLaudo {
    if (tipo === TipoLaudo.PREVENTIVA) {
      const temNao = respostas.some((r) => r.status === "NAO");
      const temObs = respostas.some((r) => !!r.observacao && r.status !== "NAO");
      if (temNao) return ResultadoLaudo.REPROVADO;
      if (temObs) return ResultadoLaudo.APROVADO_COM_RESSALVAS;
      return ResultadoLaudo.APROVADO;
    }

    if (tipo === TipoLaudo.CALIBRACAO || tipo === TipoLaudo.TSE) {
      const reprovado = respostas.some((r) => r.status === "REPROVADO");
      return reprovado ? ResultadoLaudo.REPROVADO : ResultadoLaudo.APROVADO;
    }

    return ResultadoLaudo.APROVADO;
  }

  private async assertInstrumentoValido(estabelecimentoId: string, instrumentoId: string) {
    const inst = await this.prisma.instrumentoPadrao.findFirst({
      where: { id: instrumentoId, estabelecimentoId, ativo: true },
      include: {
        certificados: {
          where: { vigente: true },
          take: 1,
          include: { _count: { select: { pontos: true } } },
          orderBy: { dataValidade: "desc" },
        },
      },
    });
    if (!inst) throw new NotFoundException("Instrumento padrão não encontrado");
    const vigente = inst.certificados[0];
    const validade = vigente?.dataValidade ?? inst.certificadoValidade;
    if (validade && validade.getTime() < Date.now()) {
      throw new ForbiddenException(
        "Instrumento com certificado vencido não pode ser usado em novo laudo",
      );
    }
    const pontos = vigente?._count.pontos ?? 0;
    if (pontos <= 0) {
      throw new ForbiddenException(
        "Instrumento sem pontos de calibração (U) no certificado vigente — cadastre o certificado RBC com pontos antes de usar no laudo",
      );
    }
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
