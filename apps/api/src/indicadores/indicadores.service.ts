import { Injectable, NotFoundException } from "@nestjs/common";
import {
  CondicaoUsoEquipamento,
  FormulaIndicador,
  PrioridadeOS,
  SituacaoEquipamento,
  StatusCapex,
  StatusOS,
  TipoMovimentacaoEquipamento,
  TipoOS,
} from "@prisma/client";
import { calcularSlaOs, horasSlaOs, LABEL_STATUS_OS, podeVerFinanceiro } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";
import {
  classificarProgramada,
  cumprimentoProgramadas,
  disponibilidadeDeParadas,
  FORMULAS_PAINEL,
  LIMITACOES_HEF,
  metricaMedia,
  motivoAguardaFornecedor,
  mtbfDeFalhas,
  mttrDeParadas,
  OS_ANTIGA_DIAS,
  razaoPercentual,
  recortarIntervalo,
  resumoCarga,
  snapshotParqueEmOperacao,
  somarCustos,
  somaIntervalosMs,
  temposDaOs,
  unirIntervalos,
  type CargaTecnico,
  type Intervalo,
  type OcorrenciaIndicador,
} from "./indicador-regras";

const STATUS_ABERTAS: StatusOS[] = [
  StatusOS.NAO_ATRIBUIDA,
  StatusOS.ABERTA,
  StatusOS.EM_ANDAMENTO,
  StatusOS.AGUARDANDO,
];

const DRILL_MAX = 40;

export type FiltrosPainel = {
  de?: string;
  ate?: string;
  setorId?: string;
  tipo?: string;
  prioridade?: string;
};

type OsPainel = {
  id: string;
  numero: number;
  codigo: string | null;
  status: StatusOS;
  prioridade: string;
  tipo: TipoOS;
  abertura: Date;
  fechamento: Date | null;
  responsavelId: string | null;
  motivoAguardo: string | null;
  oficina: string | null;
  equipamentoParado: boolean;
  condicaoFinal: CondicaoUsoEquipamento | null;
  equipamentoId: string | null;
  equipamento: {
    id: string;
    tag: string;
    nome: string;
    condicaoUso: CondicaoUsoEquipamento;
    setor: { id: string; nome: string };
    descricao: { slaConclusaoHoras: number | null; slaAtendimentoHoras: number | null };
  } | null;
  setor: { id: string; nome: string } | null;
  responsavel: { id: string; nome: string } | null;
  logs: Array<{ acao: string; createdAt: Date }>;
  itens: Array<{ tipo: string; quantidade: { toString(): string } | number; valorUnitario: { toString(): string } | number | null }>;
};

type Drill = {
  tipo: "os" | "ocorrencia" | "equipamento";
  id: string;
  codigo: string;
  numero?: number;
  tag?: string | null;
  setor?: string | null;
  status: string;
  detalhe?: string | null;
};

@Injectable()
export class IndicadoresService {
  constructor(private readonly prisma: PrismaService) {}

  async list(estabelecimentoId: string) {
    await this.ensureSistema();
    const indicadores = await this.prisma.indicador.findMany({
      where: {
        ativo: true,
        OR: [{ sistema: true }, { estabelecimentoId }],
      },
      orderBy: [{ sistema: "desc" }, { nome: "asc" }],
    });

    const withValues = await Promise.all(
      indicadores.map(async (ind) => {
        const calc = await this.calcularDetalhe(estabelecimentoId, ind);
        const historico = await this.prisma.indicadorSnapshot.findMany({
          where: { indicadorId: ind.id, estabelecimentoId },
          orderBy: { periodo: "desc" },
          take: 2,
        });
        const tendencia =
          historico.length < 2
            ? "estavel"
            : historico[0].valor > historico[1].valor
              ? "alta"
              : historico[0].valor < historico[1].valor
                ? "baixa"
                : "estavel";
        return {
          ...ind,
          valorAtual: calc.valor,
          insuficiente: calc.valor == null,
          detalhe: calc.detalhe,
          meta: ind.metaTexto ?? (ind.metaNum != null ? String(ind.metaNum) : null),
          tendencia,
        };
      }),
    );
    return withValues;
  }

  async historico(estabelecimentoId: string, id: string, meses = 6) {
    const ind = await this.prisma.indicador.findUnique({ where: { id } });
    if (!ind) throw new NotFoundException("Indicador não encontrado");
    await this.snapshotMesAtual(estabelecimentoId, ind);
    const snaps = await this.prisma.indicadorSnapshot.findMany({
      where: { indicadorId: id, estabelecimentoId },
      orderBy: { periodo: "desc" },
      take: meses,
    });
    return snaps.reverse();
  }

  async construtor(
    user: AuthUser,
    body: { nome: string; campos: string[]; formula: FormulaIndicador; metaTexto?: string; metaNum?: number },
  ) {
    const codigo = `custom_${Date.now()}`;
    return this.prisma.indicador.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        codigo,
        nome: body.nome,
        categoria: "Customizado",
        formula: body.formula,
        campos: body.campos,
        metaTexto: body.metaTexto,
        metaNum: body.metaNum,
        sistema: false,
      },
    });
  }

  async painel(user: AuthUser, filtros: FiltrosPainel = {}) {
    const estabelecimentoId = user.estabelecimentoId;
    const agora = new Date();
    const { de, ate } = this.periodo(filtros.de, filtros.ate, agora);
    const deMs = de.getTime();
    const ateMs = ate.getTime();
    const incluirCustos = podeVerFinanceiro(user.perfil, user.permissoesModulos);

    const setorFiltro = filtros.setorId
      ? {
          OR: [{ setorId: filtros.setorId }, { equipamento: { setorId: filtros.setorId } }],
        }
      : {};
    const osWhere = {
      estabelecimentoId,
      ...setorFiltro,
      ...(filtros.tipo && Object.values(TipoOS).includes(filtros.tipo as TipoOS)
        ? { tipo: filtros.tipo as TipoOS }
        : {}),
      ...(filtros.prioridade && Object.values(PrioridadeOS).includes(filtros.prioridade as PrioridadeOS)
        ? { prioridade: filtros.prioridade as PrioridadeOS }
        : {}),
      AND: [
        {
          OR: [
            { abertura: { gte: de, lte: ate } },
            { fechamento: { gte: de, lte: ate } },
            { status: { in: STATUS_ABERTAS }, abertura: { lte: ate } },
          ],
        },
      ],
    };

    const [osRows, parque, ocorrencias, movimentacoes, capex, estab] = await Promise.all([
      this.prisma.ordemServico.findMany({
        where: osWhere,
        select: {
          id: true,
          numero: true,
          codigo: true,
          status: true,
          prioridade: true,
          tipo: true,
          abertura: true,
          fechamento: true,
          responsavelId: true,
          motivoAguardo: true,
          oficina: true,
          equipamentoParado: true,
          condicaoFinal: true,
          equipamentoId: true,
          equipamento: {
            select: {
              id: true,
              tag: true,
              nome: true,
              condicaoUso: true,
              setor: { select: { id: true, nome: true } },
              descricao: { select: { slaConclusaoHoras: true, slaAtendimentoHoras: true } },
            },
          },
          setor: { select: { id: true, nome: true } },
          responsavel: { select: { id: true, nome: true } },
          logs: { select: { acao: true, createdAt: true }, orderBy: { createdAt: "asc" } },
          itens: { select: { tipo: true, quantidade: true, valorUnitario: true } },
        },
        orderBy: { abertura: "asc" },
      }),
      this.prisma.equipamento.findMany({
        where: {
          estabelecimentoId,
          situacao: { not: SituacaoEquipamento.ARQUIVADO },
          ...(filtros.setorId ? { setorId: filtros.setorId } : {}),
        },
        select: {
          id: true,
          tag: true,
          nome: true,
          situacao: true,
          condicaoUso: true,
          setor: { select: { nome: true } },
        },
      }),
      this.prisma.planoOcorrencia.findMany({
        where: {
          estabelecimentoId,
          OR: [
            { dataPrevistaOriginal: { gte: de, lte: ate } },
            { dataPrevista: { gte: de, lte: ate } },
          ],
          ...(filtros.setorId ? { plano: { equipamento: { setorId: filtros.setorId } } } : {}),
        },
        select: {
          id: true,
          status: true,
          dataPrevista: true,
          dataPrevistaOriginal: true,
          atrasoDias: true,
          executadaEm: true,
          cumpriuPlano: true,
          reprogramadaEm: true,
          motivoReprogramacao: true,
          os: { select: { id: true, numero: true, codigo: true, status: true } },
          plano: {
            select: {
              status: true,
              tipo: true,
              executorTipo: true,
              equipamento: { select: { tag: true, nome: true, setor: { select: { nome: true } } } },
            },
          },
        },
      }),
      this.prisma.equipamentoMovimentacao.findMany({
        where: {
          tipo: { in: [TipoMovimentacaoEquipamento.ASSISTENCIA, TipoMovimentacaoEquipamento.RETORNO] },
          equipamento: {
            estabelecimentoId,
            situacao: { not: SituacaoEquipamento.ARQUIVADO },
            ...(filtros.setorId ? { setorId: filtros.setorId } : {}),
          },
        },
        select: {
          equipamentoId: true,
          tipo: true,
          data: true,
          equipamento: { select: { tag: true, nome: true, setor: { select: { nome: true } } } },
        },
        orderBy: { data: "desc" },
      }),
      incluirCustos
        ? this.prisma.capexItem.findMany({
            where: { estabelecimentoId, createdAt: { gte: de, lte: ate } },
            select: { status: true, valorEstimado: true, descricao: true },
          })
        : Promise.resolve([]),
      this.prisma.estabelecimento.findUnique({
        where: { id: estabelecimentoId },
        select: { nome: true, fusoHorario: true },
      }),
    ]);

    const os = osRows as unknown as OsPainel[];
    const abertas = os.filter((o) => STATUS_ABERTAS.includes(o.status));
    const noPeriodoAbertura = os.filter((o) => o.abertura >= de && o.abertura <= ate);
    const concluidasPeriodo = os.filter(
      (o) => o.status === StatusOS.CONCLUIDA && o.fechamento && o.fechamento >= de && o.fechamento <= ate,
    );

    const porStatus = this.contar(os, (o) => o.status, (k) => LABEL_STATUS_OS[k as StatusOS] ?? k);
    const porPrioridade = this.contar(os, (o) => o.prioridade);
    const porSetor = this.contar(os, (o) => this.setorNome(o));
    const porResponsavel = this.contar(os, (o) => o.responsavel?.nome ?? "Sem responsável");

    const semResp = abertas.filter((o) => !o.responsavelId);
    const antigas = abertas.filter((o) => agora.getTime() - o.abertura.getTime() >= OS_ANTIGA_DIAS * 24 * 36e5);
    const temposAbertas = abertas
      .map((o) => (agora.getTime() - o.abertura.getTime()) / 36e5)
      .filter((h) => Number.isFinite(h));

    const parados = parque.filter((e) => e.condicaoUso === CondicaoUsoEquipamento.PARADO);
    const aguardandoForn = abertas.filter(
      (o) => o.status === StatusOS.AGUARDANDO && motivoAguardaFornecedor(o.motivoAguardo, o.oficina),
    );

    const vistoMov = new Set<string>();
    const assistenciaAberta: Drill[] = [];
    for (const m of movimentacoes) {
      if (vistoMov.has(m.equipamentoId)) continue;
      vistoMov.add(m.equipamentoId);
      if (m.tipo === TipoMovimentacaoEquipamento.ASSISTENCIA) {
        assistenciaAberta.push({
          tipo: "equipamento",
          id: m.equipamentoId,
          codigo: m.equipamento.tag,
          tag: m.equipamento.tag,
          setor: m.equipamento.setor.nome,
          status: "ASSISTENCIA",
          detalhe: m.equipamento.nome,
        });
      }
    }

    const planosExt = ocorrencias.filter(
      (oc) =>
        oc.plano.executorTipo === "EXTERNO" &&
        oc.status !== "EXECUTADA" &&
        oc.status !== "CANCELADA",
    );

    const ocIndic: OcorrenciaIndicador[] = ocorrencias.map((oc) => ({
      id: oc.id,
      status: oc.status,
      dataPrevista: oc.dataPrevista,
      dataPrevistaOriginal: oc.dataPrevistaOriginal,
      atrasoDias: oc.atrasoDias,
      executadaEm: oc.executadaEm,
      cumpriuPlano: oc.cumpriuPlano,
      reprogramadaEm: oc.reprogramadaEm,
      planoStatus: oc.plano.status,
    }));
    const prog = cumprimentoProgramadas(ocIndic, de, ate, agora);
    const drillProg: Record<string, Drill[]> = {
      prevista: [],
      pendente_no_prazo: [],
      pendente_atrasada: [],
      executada_no_prazo: [],
      executada_atrasada: [],
      cancelada: [],
      plano_suspenso: [],
    };
    for (const oc of ocorrencias) {
      const classe = classificarProgramada(
        {
          id: oc.id,
          status: oc.status,
          dataPrevista: oc.dataPrevista,
          dataPrevistaOriginal: oc.dataPrevistaOriginal,
          atrasoDias: oc.atrasoDias,
          executadaEm: oc.executadaEm,
          cumpriuPlano: oc.cumpriuPlano,
          planoStatus: oc.plano.status,
        },
        agora,
      );
      const orig = new Date(oc.dataPrevistaOriginal);
      if (orig < de || orig > ate) continue;
      drillProg[classe].push({
        tipo: "ocorrencia",
        id: oc.id,
        codigo: oc.os?.codigo ?? oc.plano.equipamento.tag,
        numero: oc.os?.numero,
        tag: oc.plano.equipamento.tag,
        setor: oc.plano.equipamento.setor.nome,
        status: classe,
        detalhe: [
          oc.plano.tipo,
          oc.reprogramadaEm ? `reagendada (atraso ${oc.atrasoDias}d na original)` : `atraso ${oc.atrasoDias}d`,
          oc.motivoReprogramacao,
        ]
          .filter(Boolean)
          .join(" · "),
      });
    }

    const primeiro: number[] = [];
    const duracoes: number[] = [];
    const trabalhados: number[] = [];
    const slaAtendOk: { ok: number; n: number } = { ok: 0, n: 0 };
    const slaConcOk: { ok: number; n: number } = { ok: 0, n: 0 };
    const paradasPorEq = new Map<string, Intervalo[]>();
    const paradasEncerradasMs: number[] = [];
    const eqsComSinal = new Set<string>();
    const cargaMap = new Map<string, CargaTecnico & { abertosHoras: number[] }>();

    const ensureCarga = (id: string, nome: string) => {
      let row = cargaMap.get(id);
      if (!row) {
        row = {
          id,
          nome,
          abertas: 0,
          emAndamento: 0,
          aguardando: 0,
          concluidasPeriodo: 0,
          tempoTrabalhadoHoras: null,
          tempoAbertoHorasMedia: null,
          abertosHoras: [],
        };
        cargaMap.set(id, row);
      }
      return row;
    };

    for (const o of os) {
      const t = temposDaOs({
        abertura: o.abertura,
        fechamento: o.fechamento,
        status: o.status,
        agora,
        logs: o.logs.map((l) => ({ acao: l.acao, em: l.createdAt })),
        equipamentoParado: o.equipamentoParado,
        condicaoFinal: o.condicaoFinal,
      });
      if (o.status === StatusOS.CONCLUIDA && t.duracaoTotalMs != null) duracoes.push(t.duracaoTotalMs / 36e5);
      if (t.atePrimeiroAtendimentoMs != null) primeiro.push(t.atePrimeiroAtendimentoMs / 36e5);
      if (t.tempoTrabalhadoMs != null) trabalhados.push(t.tempoTrabalhadoMs / 36e5);

      const slaHoras = horasSlaOs({
        prioridade: o.prioridade,
        status: o.status,
        slaConclusaoHoras: o.equipamento?.descricao.slaConclusaoHoras,
        slaAtendimentoHoras: o.equipamento?.descricao.slaAtendimentoHoras,
      });
      const temMetaAtend =
        o.equipamento?.descricao.slaAtendimentoHoras != null && o.equipamento.descricao.slaAtendimentoHoras > 0;
      if (temMetaAtend && t.atePrimeiroAtendimentoMs != null) {
        slaAtendOk.n += 1;
        if (t.atePrimeiroAtendimentoMs / 36e5 <= o.equipamento!.descricao.slaAtendimentoHoras!) slaAtendOk.ok += 1;
      }
      if (o.status === StatusOS.CONCLUIDA && o.fechamento) {
        slaConcOk.n += 1;
        const limite = o.abertura.getTime() + slaHoras.horas * 36e5;
        if (o.fechamento.getTime() <= limite) slaConcOk.ok += 1;
      }

      const parado = o.equipamentoParado || o.condicaoFinal === CondicaoUsoEquipamento.PARADO;
      if (parado && o.equipamentoId) {
        eqsComSinal.add(o.equipamentoId);
        const fim = o.fechamento && o.condicaoFinal !== CondicaoUsoEquipamento.PARADO ? o.fechamento.getTime() : agora.getTime();
        const rec = recortarIntervalo({ inicio: o.abertura.getTime(), fim }, deMs, ateMs);
        if (rec) {
          const list = paradasPorEq.get(o.equipamentoId) ?? [];
          list.push(rec);
          paradasPorEq.set(o.equipamentoId, list);
        }
        if (o.fechamento && o.condicaoFinal !== CondicaoUsoEquipamento.PARADO && t.indisponibilidadeMs != null) {
          paradasEncerradasMs.push(t.indisponibilidadeMs);
        }
      }

      if (o.responsavel) {
        const c = ensureCarga(o.responsavel.id, o.responsavel.nome);
        if (STATUS_ABERTAS.includes(o.status)) {
          if (o.status === StatusOS.EM_ANDAMENTO) c.emAndamento += 1;
          else if (o.status === StatusOS.AGUARDANDO) c.aguardando += 1;
          else c.abertas += 1;
          c.abertosHoras.push((agora.getTime() - o.abertura.getTime()) / 36e5);
        }
        if (concluidasPeriodo.some((x) => x.id === o.id)) c.concluidasPeriodo += 1;
        if (t.tempoTrabalhadoMs != null) {
          c.tempoTrabalhadoHoras = (c.tempoTrabalhadoHoras ?? 0) + t.tempoTrabalhadoMs / 36e5;
        }
      }
    }

    for (const e of parados) eqsComSinal.add(e.id);

    const downtimeMs = [...paradasPorEq.values()].reduce((s, list) => s + somaIntervalosMs(unirIntervalos(list)), 0);
    const parqueHorasMs = parque.length * Math.max(0, ateMs - deMs);
    const mttr = mttrDeParadas(paradasEncerradasMs);
    const falhasParada = [...paradasPorEq.values()].reduce((n, list) => n + unirIntervalos(list).length, 0);
    const mtbf = mtbfDeFalhas({
      periodoMs: parqueHorasMs,
      downtimeMs,
      falhas: falhasParada,
    });
    const disp = disponibilidadeDeParadas({
      parqueHorasMs,
      downtimeMs,
      equipamentosComSinal: eqsComSinal.size,
      equipamentosParque: parque.length,
    });
    const snapshot = snapshotParqueEmOperacao(
      parque.filter(
        (e) =>
          e.situacao === SituacaoEquipamento.ATIVO ||
          e.situacao === SituacaoEquipamento.EM_GARANTIA ||
          e.situacao === SituacaoEquipamento.EM_GARANTIA_ESTENDIDA,
      ).length,
      parque.length,
    );

    const carga = [...cargaMap.values()].map((c) => {
      const { abertosHoras, ...rest } = c;
      rest.tempoAbertoHorasMedia =
        abertosHoras.length === 0 ? null : Number((abertosHoras.reduce((a, b) => a + b, 0) / abertosHoras.length).toFixed(2));
      if (rest.tempoTrabalhadoHoras != null) rest.tempoTrabalhadoHoras = Number(rest.tempoTrabalhadoHoras.toFixed(2));
      return resumoCarga(rest);
    });

    const custosLinhas = os.flatMap((o) =>
      o.itens.map((i) => ({
        valor: Number(i.quantidade) * Number(i.valorUnitario ?? 0),
        natureza: "realizado" as const,
        tipo: i.tipo,
        equipamentoTag: o.equipamento?.tag ?? "—",
        setor: this.setorNome(o),
        os: o.codigo ?? `OS-${o.numero}`,
      })),
    );
    const custos = somarCustos([
      ...custosLinhas,
      ...capex.map((c) => ({
        valor: Number(c.valorEstimado),
        natureza: (c.status === StatusCapex.APROVADO || c.status === StatusCapex.EXECUTADO
          ? "aprovado"
          : "estimado") as "aprovado" | "estimado",
      })),
    ]);
    const custoPorEq = this.somarGrupo(custosLinhas, (l) => l.equipamentoTag);
    const custoPorSetor = this.somarGrupo(custosLinhas, (l) => l.setor);
    const custoPorTipo = this.somarGrupo(custosLinhas, (l) => l.tipo);

    const falhas: Record<string, { tag: string; nome: string; n: number }> = {};
    for (const o of os.filter((x) => x.tipo === TipoOS.CORRETIVA && x.equipamento)) {
      const k = o.equipamento!.id;
      falhas[k] ??= { tag: o.equipamento!.tag, nome: o.equipamento!.nome, n: 0 };
      falhas[k].n += 1;
    }
    const recorrencia = Object.values(falhas)
      .filter((f) => f.n >= 2)
      .sort((a, b) => b.n - a.n)
      .slice(0, 20);

    const slaAbertoEstourado = abertas.filter((o) =>
      calcularSlaOs({
        abertura: o.abertura,
        fechamento: o.fechamento,
        status: o.status,
        prioridade: o.prioridade,
        slaConclusaoHoras: o.equipamento?.descricao.slaConclusaoHoras,
        slaAtendimentoHoras: o.equipamento?.descricao.slaAtendimentoHoras,
        agora,
      }).slaEstourado,
    );

    return {
      atualizadoEm: agora.toISOString(),
      estabelecimento: { id: estabelecimentoId, nome: estab?.nome ?? "" },
      filtros: {
        de: de.toISOString(),
        ate: ate.toISOString(),
        setorId: filtros.setorId ?? null,
        tipo: filtros.tipo ?? null,
        prioridade: filtros.prioridade ?? null,
      },
      limitacoes: LIMITACOES_HEF,
      formulas: FORMULAS_PAINEL,
      operacional: {
        totais: {
          osNoRecorte: os.length,
          abertas: abertas.length,
          entradasPeriodo: noPeriodoAbertura.length,
          conclusoesPeriodo: concluidasPeriodo.length,
          semResponsavel: semResp.length,
          antigas: antigas.length,
          slaEstourado: slaAbertoEstourado.length,
          parados: parados.length,
          aguardandoFornecedor: aguardandoForn.length,
          assistenciaSemRetorno: assistenciaAberta.length,
          planosExecutorExterno: planosExt.length,
        },
        porStatus,
        porPrioridade,
        porSetor,
        porResponsavel,
        tempoAbertoHoras: metricaMedia(
          temposAbertas,
          "agora − abertura das OS em curso",
          "OS com status aberto",
        ),
        semResponsavel: this.drillOs(semResp),
        antigas: this.drillOs(antigas, (o) => `${OS_ANTIGA_DIAS}+ dias em aberto`),
        entradasPeriodo: this.drillOs(noPeriodoAbertura),
        conclusoesPeriodo: this.drillOs(concluidasPeriodo),
        indisponiveis: parados.map((e) => ({
          tipo: "equipamento" as const,
          id: e.id,
          codigo: e.tag,
          tag: e.tag,
          setor: e.setor.nome,
          status: "PARADO",
          detalhe: e.nome,
        })),
        aguardandoFornecedor: this.drillOs(
          aguardandoForn,
          (o) => o.motivoAguardo ?? o.oficina ?? "Aguardando (motivo cita fornecedor/assistência)",
        ),
        encaminhamentoExterno: {
          criterio:
            "OS em aguardo com motivo de fornecedor/assistência + última movimentação ASSISTÊNCIA sem RETORNO + programadas com executor externo. O módulo de encaminhamento (quando publicado) passa a ser a origem preferencial.",
          assistenciaSemRetorno: assistenciaAberta.slice(0, DRILL_MAX),
          planosExecutorExterno: planosExt.slice(0, DRILL_MAX).map((oc) => ({
            tipo: "ocorrencia" as const,
            id: oc.id,
            codigo: oc.os?.codigo ?? oc.plano.equipamento.tag,
            numero: oc.os?.numero,
            tag: oc.plano.equipamento.tag,
            setor: oc.plano.equipamento.setor.nome,
            status: oc.status,
            detalhe: "executor externo",
          })),
        },
        origem: "ordem_servico + equipamento.condicaoUso + movimentação ASSISTENCIA/RETORNO",
      },
      programadas: {
        cumprimento: prog.razao,
        devidas: prog.devidas,
        contagens: prog.contagens,
        excluidas: prog.excluidas,
        explicacao:
          "Cumprimento = executadas até a data original / devidas no período. Reagendar muda a data prevista mas o atraso segue a data original. Cancelamentos e planos suspensos/desativados saem do denominador e aparecem à parte.",
        registros: Object.fromEntries(
          Object.entries(drillProg).map(([k, v]) => [k, { total: v.length, itens: v.slice(0, DRILL_MAX) }]),
        ),
        origem: "plano_ocorrencia.dataPrevistaOriginal + atrasoDias",
      },
      tempos: {
        atePrimeiroAtendimento: metricaMedia(
          primeiro,
          "primeiro INICIO_EXECUCAO − abertura",
          "logs da OS",
          1,
          "Sem log INICIO_EXECUCAO no recorte. Não se usa a duração da OS no lugar.",
        ),
        duracaoTotalOs: metricaMedia(
          duracoes,
          "fechamento − abertura (relógio corrido)",
          "OS concluídas no recorte",
        ),
        tempoTrabalhado: metricaMedia(
          trabalhados,
          "intervalos INICIO/RETOMADA → PAUSA/AGUARDO/FECHAMENTO",
          "logs da OS",
          1,
          "Sem cadeia de início/pausa/retomada. Pausas não entram. Calendário de expediente não existe — é relógio corrido.",
        ),
        slaPrimeiroAtendimento: razaoPercentual(
          slaAtendOk.ok,
          slaAtendOk.n,
          "OS com meta de 1º atendimento no tipo e com log INICIO_EXECUCAO dentro do prazo",
          "Nenhum tipo no recorte tem slaAtendimentoHoras e log de início. Meta de 1º atendimento não é inventada.",
        ),
        slaConclusao: razaoPercentual(
          slaConcOk.ok,
          slaConcOk.n,
          "OS concluídas com fechamento ≤ abertura + prazo (tipo ou prioridade)",
          "Nenhuma OS concluída no recorte.",
        ),
        notas: [
          "1º atendimento ≠ duração da OS ≠ tempo trabalhado ≠ indisponibilidade.",
          "SLA usa relógio corrido a partir da abertura; pausas e calendário de expediente não descontam o limite.",
          "Metas de 1º atendimento só existem quando o tipo de equipamento tem slaAtendimentoHoras.",
        ],
      },
      confiabilidade: {
        mttr,
        mtbf,
        disponibilidade: disp,
        parqueEmOperacao: snapshot,
        horasParadaRegistradas: Number((downtimeMs / 36e5).toFixed(2)),
        equipamentosComParadaRegistrada: eqsComSinal.size,
        nota: "MTTR/MTBF/disponibilidade só saem com paradas registradas. Snapshot de situação do parque não é uptime.",
      },
      custos: incluirCustos
        ? {
            realizado: custos.realizado,
            estimadoCapex: custos.estimado,
            aprovadoCapex: custos.aprovado,
            porEquipamento: custoPorEq,
            porSetor: custoPorSetor,
            porTipo: custoPorTipo,
            recorrenciaFalhas: recorrencia,
            origem: "ordem_servico_item (realizado) separado de capex_item (estimado/aprovado). Rateio de contrato não entra aqui.",
          }
        : { oculto: true, motivo: "Sem permissão de leitura financeira nesta instituição." },
      carga: {
        tecnicos: carga.sort((a, b) => b.abertas + b.emAndamento + b.aguardando - (a.abertas + a.emAndamento + a.aguardando)),
        nota: "Carga mostra fila, andamento, aguardo, concluídas no período e tempo trabalhado (se houver log). Não reduz o técnico a quantidade de OS fechadas.",
      },
    };
  }

  exportCsv(painel: Awaited<ReturnType<IndicadoresService["painel"]>>): string {
    const linhas: string[] = [];
    const push = (row: Array<string | number | null | undefined>) =>
      linhas.push(row.map((c) => this.csvCell(c)).join(";"));
    push(["seção", "chave", "valor", "n", "status", "origem"]);
    push(["meta", "atualizadoEm", painel.atualizadoEm, "", "", ""]);
    push(["meta", "de", painel.filtros.de, "", "", ""]);
    push(["meta", "ate", painel.filtros.ate, "", "", ""]);
    const op = painel.operacional.totais;
    for (const [k, v] of Object.entries(op)) push(["operacional", k, v, "", "medido", painel.operacional.origem]);
    const cump = painel.programadas.cumprimento;
    push([
      "programadas",
      "cumprimento",
      cump.percentual,
      `${cump.numerador}/${cump.denominador}`,
      cump.status,
      painel.programadas.origem,
    ]);
    for (const [k, v] of Object.entries(painel.programadas.contagens)) {
      push(["programadas", k, v, "", "medido", painel.programadas.origem]);
    }
    const tempos = painel.tempos;
    for (const chave of ["atePrimeiroAtendimento", "duracaoTotalOs", "tempoTrabalhado"] as const) {
      const m = tempos[chave];
      push(["tempos", chave, m.valor, m.n, m.status, m.origem]);
    }
    push(["confiabilidade", "mttr", painel.confiabilidade.mttr.valor, painel.confiabilidade.mttr.n, painel.confiabilidade.mttr.status, painel.confiabilidade.mttr.origem]);
    push(["confiabilidade", "mtbf", painel.confiabilidade.mtbf.valor, painel.confiabilidade.mtbf.n, painel.confiabilidade.mtbf.status, painel.confiabilidade.mtbf.origem]);
    push(["confiabilidade", "disponibilidade", painel.confiabilidade.disponibilidade.valor, painel.confiabilidade.disponibilidade.n, painel.confiabilidade.disponibilidade.status, painel.confiabilidade.disponibilidade.origem]);
    if ("realizado" in painel.custos) {
      push(["custos", "realizado", painel.custos.realizado, "", "medido", painel.custos.origem]);
      push(["custos", "estimadoCapex", painel.custos.estimadoCapex, "", "estimado", painel.custos.origem]);
      push(["custos", "aprovadoCapex", painel.custos.aprovadoCapex, "", "aprovado", painel.custos.origem]);
    }
    for (const t of painel.carga.tecnicos) {
      push(["carga", t.nome, `abertas=${t.abertas};andamento=${t.emAndamento};aguardando=${t.aguardando};concluidas=${t.concluidasPeriodo};trabalhado_h=${t.tempoTrabalhadoHoras ?? "n/d"}`, "", "medido", "OS do responsável"]);
    }
    return linhas.join("\n");
  }

  private csvCell(v: string | number | null | undefined) {
    const s = v == null ? "" : String(v);
    if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  private periodo(deStr?: string, ateStr?: string, agora = new Date()) {
    const de = deStr ? new Date(deStr) : new Date(agora.getFullYear(), agora.getMonth(), 1);
    const ate = ateStr ? new Date(ateStr) : agora;
    if (ateStr && ateStr.length <= 10) ate.setHours(23, 59, 59, 999);
    if (deStr && deStr.length <= 10) de.setHours(0, 0, 0, 0);
    return { de, ate };
  }

  private setorNome(o: OsPainel) {
    return o.setor?.nome ?? o.equipamento?.setor.nome ?? "Sem setor";
  }

  private contar<T>(rows: T[], chave: (r: T) => string, label?: (k: string) => string) {
    const map = new Map<string, number>();
    for (const r of rows) {
      const k = chave(r) || "—";
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    const itens = [...map.entries()].map(([k, total]) => ({ chave: k, label: label ? label(k) : k, total }));
    const soma = itens.reduce((s, i) => s + i.total, 0);
    return { itens, soma };
  }

  private somarGrupo<T extends { valor: number }>(rows: T[], chave: (r: T) => string) {
    const map = new Map<string, number>();
    for (const r of rows) {
      const k = chave(r) || "—";
      map.set(k, (map.get(k) ?? 0) + r.valor);
    }
    return [...map.entries()]
      .map(([chave, valor]) => ({ chave, valor: Number(valor.toFixed(2)) }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 30);
  }

  private drillOs(rows: OsPainel[], detalhe?: (o: OsPainel) => string | null): { total: number; itens: Drill[] } {
    return {
      total: rows.length,
      itens: rows.slice(0, DRILL_MAX).map((o) => ({
        tipo: "os" as const,
        id: o.id,
        codigo: o.codigo ?? `OS-${o.numero}`,
        numero: o.numero,
        tag: o.equipamento?.tag ?? null,
        setor: this.setorNome(o),
        status: o.status,
        detalhe: detalhe ? detalhe(o) : o.responsavel?.nome ?? null,
      })),
    };
  }

  private async ensureSistema() {
    const defs = [
      {
        codigo: "disp_criticos",
        nome: "Parque em operação (snapshot)",
        categoria: "Operação",
        formula: FormulaIndicador.PERCENTUAL,
        metaTexto: "não é uptime — ver painel do gestor",
        metaNum: null as number | null,
      },
      {
        codigo: "mttr",
        nome: "MTTR (paradas registradas)",
        categoria: "Operação",
        formula: FormulaIndicador.MEDIA,
        metaTexto: "só com início e fim de parada",
        metaNum: null,
      },
      {
        codigo: "cumpr_prev",
        nome: "Cumprimento de programadas",
        categoria: "Manutenção",
        formula: FormulaIndicador.PERCENTUAL,
        metaTexto: "executadas na data original / devidas",
        metaNum: null,
      },
      {
        codigo: "idx_conf",
        nome: "Índice de conformidade",
        categoria: "Qualidade",
        formula: FormulaIndicador.PERCENTUAL,
        metaTexto: "evidências / requisitos ativos",
        metaNum: null,
      },
      {
        codigo: "custo_manut",
        nome: "Custo manutenção / valor patrimonial",
        categoria: "Financeiro",
        formula: FormulaIndicador.PERCENTUAL,
        metaTexto: "itens de OS / valor de aquisição",
        metaNum: null,
      },
    ];
    for (const d of defs) {
      await this.prisma.indicador.upsert({
        where: { codigo: d.codigo },
        create: { ...d, sistema: true, campos: [] },
        update: { nome: d.nome, metaTexto: d.metaTexto, metaNum: d.metaNum },
      });
    }
  }

  private async calcularDetalhe(
    estabelecimentoId: string,
    ind: { codigo: string; sistema: boolean; formula: FormulaIndicador; campos: unknown },
  ): Promise<{ valor: number | null; detalhe: string }> {
    if (ind.sistema) {
      switch (ind.codigo) {
        case "disp_criticos": {
          const ativos = await this.prisma.equipamento.count({
            where: {
              estabelecimentoId,
              situacao: {
                in: [
                  SituacaoEquipamento.ATIVO,
                  SituacaoEquipamento.EM_GARANTIA,
                  SituacaoEquipamento.EM_GARANTIA_ESTENDIDA,
                ],
              },
            },
          });
          const total = await this.prisma.equipamento.count({
            where: { estabelecimentoId, situacao: { not: SituacaoEquipamento.ARQUIVADO } },
          });
          const r = snapshotParqueEmOperacao(ativos, total);
          return {
            valor: r.percentual,
            detalhe: r.status === "dados_insuficientes" ? r.motivo ?? "" : `${ativos}/${total} em operação (snapshot, não é disponibilidade)`,
          };
        }
        case "mttr": {
          const agora = new Date();
          const de = new Date(agora.getFullYear(), agora.getMonth(), 1);
          const rows = await this.prisma.ordemServico.findMany({
            where: {
              estabelecimentoId,
              tipo: TipoOS.CORRETIVA,
              equipamentoParado: true,
              fechamento: { gte: de, lte: agora },
              status: StatusOS.CONCLUIDA,
            },
            select: { abertura: true, fechamento: true },
          });
          const m = mttrDeParadas(
            rows
              .filter((o) => o.fechamento)
              .map((o) => o.fechamento!.getTime() - o.abertura.getTime()),
          );
          return { valor: m.valor, detalhe: m.motivo ?? `${m.n} paradas encerradas` };
        }
        case "cumpr_prev": {
          const agora = new Date();
          const de = new Date(agora.getFullYear(), agora.getMonth(), 1);
          const ocs = await this.prisma.planoOcorrencia.findMany({
            where: { estabelecimentoId, dataPrevistaOriginal: { gte: de, lte: agora } },
            select: {
              id: true,
              status: true,
              dataPrevista: true,
              dataPrevistaOriginal: true,
              atrasoDias: true,
              executadaEm: true,
              cumpriuPlano: true,
              plano: { select: { status: true } },
            },
          });
          const r = cumprimentoProgramadas(
            ocs.map((o) => ({ ...o, planoStatus: o.plano.status })),
            de,
            agora,
            agora,
          );
          return {
            valor: r.razao.percentual,
            detalhe: `${r.razao.numerador}/${r.razao.denominador} na data original`,
          };
        }
        case "idx_conf": {
          const reqs = await this.prisma.requisitoNormativo.count({ where: { ativo: true } });
          if (!reqs) return { valor: null, detalhe: "Sem requisitos ativos — não é 100%." };
          const evs = await this.prisma.evidenciaConformidade.findMany({
            where: { estabelecimentoId, status: "CONFORME" },
            distinct: ["requisitoId"],
          });
          const r = razaoPercentual(evs.length, reqs, "evidências conformes distintas / requisitos");
          return { valor: r.percentual, detalhe: `${evs.length}/${reqs}` };
        }
        case "custo_manut": {
          const itens = await this.prisma.ordemServicoItem.findMany({
            where: { ordemServico: { estabelecimentoId }, estornado: false, naturezaCusto: "REALIZADO" },
            select: { quantidade: true, valorUnitario: true },
          });
          const custo = itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valorUnitario ?? 0), 0);
          const eqs = await this.prisma.equipamento.findMany({
            where: { estabelecimentoId },
            select: { valorAquisicao: true },
          });
          const patrimonio = eqs.reduce((s, e) => s + Number(e.valorAquisicao ?? 0), 0);
          const r = razaoPercentual(custo, patrimonio, "itens de OS / valor de aquisição cadastrado");
          return { valor: r.percentual, detalhe: r.motivo ?? `R$ ${custo.toFixed(2)} / R$ ${patrimonio.toFixed(2)}` };
        }
        default:
          return { valor: null, detalhe: "Indicador de sistema desconhecido" };
      }
    }
    const n = await this.prisma.ordemServico.count({
      where: {
        estabelecimentoId,
        status: { in: [StatusOS.ABERTA, StatusOS.EM_ANDAMENTO, StatusOS.NAO_ATRIBUIDA] },
      },
    });
    return { valor: n, detalhe: "Contagem de OS abertas (customizado)" };
  }

  private async snapshotMesAtual(
    estabelecimentoId: string,
    ind: { id: string; codigo: string; sistema: boolean; formula: FormulaIndicador; campos: unknown },
  ) {
    const periodo = new Date().toISOString().slice(0, 7);
    const calc = await this.calcularDetalhe(estabelecimentoId, ind);
    if (calc.valor == null) return;
    await this.prisma.indicadorSnapshot.upsert({
      where: {
        indicadorId_estabelecimentoId_periodo: {
          indicadorId: ind.id,
          estabelecimentoId,
          periodo,
        },
      },
      create: { indicadorId: ind.id, estabelecimentoId, periodo, valor: calc.valor },
      update: { valor: calc.valor },
    });
  }
}
