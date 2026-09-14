/**
 * Planos de manutenção: preventiva, calibração, TSE, qualificação e outros.
 * Não inventa periodicidade. Não duplica OS ao rerodar. Corretiva não cumpre o ciclo.
 */
import { Cron } from "@nestjs/schedule";
import {
  ExecutorPlano,
  FontePeriodicidade,
  ModoAgendamentoPlano,
  SituacaoEquipamento,
  StatusOS,
  StatusPlanoInstancia,
  TipoAtividadePlano,
  TipoOS,
  TipoTestePlano,
} from "@prisma/client";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { podeEditarCadastros, podeEditarModulo } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";
import {
  calcularAtrasoDias,
  chaveUnicaPlano,
  classificarAgenda,
  startOfDay as startOfDayRegra,
} from "./plano-regras";
import {
  ensureOcorrenciaAberta,
  gerarOsDaOcorrencia,
  gerarOsPendentes,
  registrarExecucaoPlano,
  reprogramarOcorrencia,
  sincronizarInstanciasCatalogo,
  tipoOsFromLaudo,
} from "./plano-ocorrencia";

const TIPOS_RAMPUP: TipoTestePlano[] = [
  TipoTestePlano.PREVENTIVA,
  TipoTestePlano.CALIBRACAO,
  TipoTestePlano.TSE,
  TipoTestePlano.QUALIFICACAO,
];

export type RampUpOptions = {
  horizonteDias?: number;
  inicio?: Date;
  forcarAnual?: boolean;
  dryRun?: boolean;
};

export type UpsertPlanoInput = {
  equipamentoId?: string;
  modeloId?: string;
  tipo: TipoAtividadePlano;
  tipoCustomNome?: string;
  grupoNome?: string;
  periodicidadeMeses?: number | null;
  fontePeriodicidade?: FontePeriodicidade | null;
  fontePeriodicidadeObs?: string | null;
  modoAgendamento?: ModoAgendamentoPlano;
  diaFixo?: number | null;
  mesFixo?: number | null;
  antecedenciaDias?: number;
  proximaData?: string | null;
  responsavelId?: string | null;
  executorTipo?: ExecutorPlano;
  fornecedorId?: string | null;
  procedimentoCodigo?: string | null;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function slotDay(index: number, total: number, horizonteDias: number, inicio: Date): Date {
  if (total <= 0) return startOfDay(inicio);
  const raw = Math.floor((index * horizonteDias) / Math.max(total, 1));
  let day = Math.min(horizonteDias - 1, Math.max(0, raw));
  let date = addDays(inicio, day);
  const wd = date.getDay();
  if (wd === 0) date = addDays(date, 1);
  if (wd === 6) date = addDays(date, 2);
  const fim = addDays(inicio, horizonteDias - 1);
  if (date > fim) date = fim;
  return startOfDay(date);
}

function assertPodeEditar(user: AuthUser) {
  if (
    !podeEditarModulo(user.perfil, user.permissoesModulos, "os") &&
    !podeEditarModulo(user.perfil, user.permissoesModulos, "equipamentos")
  ) {
    throw new ForbiddenException("Sem permissão para editar o cronograma de manutenção");
  }
}

@Injectable()
export class PlanosService {
  private readonly log = new Logger(PlanosService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron("20 6 * * *", { timeZone: "America/Sao_Paulo" })
  async cronGerarOsPendentes() {
    if (process.env.PLANOS_CRON === "0") return;
    const estabs = await this.prisma.estabelecimento.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
    });
    for (const e of estabs) {
      try {
        const r = await gerarOsPendentes(this.prisma, e.id);
        if (r.processadas > 0) {
          this.log.log(
            `planos cron ${e.nome}: criadas=${r.criadas} vinculadas=${r.vinculadas} falhas=${r.falhas}`,
          );
        }
      } catch (err) {
        this.log.error(`planos cron falhou em ${e.nome}`, err instanceof Error ? err.stack : err);
      }
    }
  }

  listTiposEquipamento(estabelecimentoId: string) {
    return this.prisma.tipoEquipamentoPlano.findMany({
      where: { estabelecimentoId, ativo: true },
      select: {
        id: true,
        nome: true,
        testes: {
          where: { ativo: true },
          select: { tipoTeste: true, procedimentoCodigo: true, periodicidadeMeses: true },
          orderBy: { tipoTeste: "asc" },
        },
      },
      orderBy: { nome: "asc" },
    });
  }

  previewRampUp(estabelecimentoId: string, opts: RampUpOptions = {}) {
    return this.gerarRampUpInternal(estabelecimentoId, { ...opts, dryRun: true });
  }

  async gerarRampUp(user: AuthUser, opts: RampUpOptions = {}) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    return this.gerarRampUpInternal(user.estabelecimentoId, {
      ...opts,
      dryRun: false,
      usuarioId: user.userId,
    });
  }

  private async gerarRampUpInternal(
    estabelecimentoId: string,
    opts: RampUpOptions & { usuarioId?: string },
  ) {
    const horizonteDias = opts.horizonteDias ?? 90;
    const inicio = startOfDay(opts.inicio ?? new Date());
    const forcarAnual = opts.forcarAnual === true;
    const dryRun = Boolean(opts.dryRun);

    if (forcarAnual && !dryRun) {
      await this.prisma.planoTeste.updateMany({
        where: {
          tipoTeste: { in: TIPOS_RAMPUP },
          tipoEquipamentoPlano: { estabelecimentoId },
          ativo: true,
        },
        data: { periodicidadeMeses: 12 },
      });
    }

    if (!dryRun) {
      await sincronizarInstanciasCatalogo(this.prisma, estabelecimentoId, {
        usuarioId: opts.usuarioId,
      });
    }

    const equipamentos = await this.prisma.equipamento.findMany({
      where: {
        estabelecimentoId,
        situacao: {
          in: [
            SituacaoEquipamento.ATIVO,
            SituacaoEquipamento.EM_GARANTIA,
            SituacaoEquipamento.EM_GARANTIA_ESTENDIDA,
          ],
        },
        tipoEquipamentoPlanoId: { not: null },
      },
      include: {
        setor: { select: { nome: true } },
        tipoEquipamentoPlano: {
          include: {
            testes: { where: { ativo: true, tipoTeste: { in: TIPOS_RAMPUP } } },
          },
        },
      },
      orderBy: [{ setor: { nome: "asc" } }, { tag: "asc" }],
    });

    type Job = {
      equipamentoId: string;
      tag: string;
      nome: string;
      setor: string;
      tipoTeste: TipoTestePlano;
      tipoOs: TipoOS;
      procedimentoCodigo: string;
      periodicidadeMeses: number | null;
    };

    const jobs: Job[] = [];
    let semPlano = 0;
    let semPeriodicidade = 0;
    for (const eq of equipamentos) {
      const testes = eq.tipoEquipamentoPlano?.testes ?? [];
      if (testes.length === 0) {
        semPlano += 1;
        continue;
      }
      for (const t of testes) {
        if (!t.periodicidadeMeses || t.periodicidadeMeses < 1) {
          semPeriodicidade += 1;
          continue;
        }
        jobs.push({
          equipamentoId: eq.id,
          tag: eq.tag,
          nome: eq.nome,
          setor: eq.setor.nome,
          tipoTeste: t.tipoTeste,
          tipoOs: tipoOsFromLaudo(t.tipoTeste),
          procedimentoCodigo: t.procedimentoCodigo,
          periodicidadeMeses: t.periodicidadeMeses,
        });
      }
    }

    const abertas = await this.prisma.ordemServico.findMany({
      where: {
        estabelecimentoId,
        tipo: { in: [TipoOS.PREVENTIVA, TipoOS.CALIBRACAO, TipoOS.TSE, TipoOS.QUALIFICACAO] },
        status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO, StatusOS.AGUARDANDO] },
      },
      select: { equipamentoId: true, tipo: true },
    });
    const chaveAberta = new Set(abertas.map((o) => `${o.equipamentoId}|${o.tipo}`));

    const pulados: Array<{ tag: string; tipo: string; motivo: string }> = [];
    const candidatos = jobs.filter((job) => {
      const key = `${job.equipamentoId}|${job.tipoOs}`;
      if (chaveAberta.has(key)) {
        pulados.push({ tag: job.tag, tipo: job.tipoTeste, motivo: "Já existe OS aberta deste tipo" });
        return false;
      }
      return true;
    });

    const finalJobs = candidatos.map((j, i) => ({
      ...j,
      abertura: slotDay(i, candidatos.length || 1, horizonteDias, inicio),
    }));

    const porTipo = {
      PREVENTIVA: finalJobs.filter((j) => j.tipoTeste === "PREVENTIVA").length,
      CALIBRACAO: finalJobs.filter((j) => j.tipoTeste === "CALIBRACAO").length,
      TSE: finalJobs.filter((j) => j.tipoTeste === "TSE").length,
      QUALIFICACAO: finalJobs.filter((j) => j.tipoTeste === "QUALIFICACAO").length,
    };

    if (dryRun) {
      return {
        dryRun: true,
        inicio: inicio.toISOString(),
        fim: addDays(inicio, horizonteDias - 1).toISOString(),
        horizonteDias,
        periodicidadeMeses: forcarAnual ? 12 : null,
        forcarAnual,
        equipamentosComPlano: equipamentos.length - semPlano,
        equipamentosSemTeste: semPlano,
        semPeriodicidade,
        jobsPlanejados: finalJobs.length,
        pulados: pulados.length,
        porTipo,
        amostra: finalJobs.slice(0, 20).map((j) => ({
          tag: j.tag,
          tipo: j.tipoTeste,
          abertura: j.abertura.toISOString().slice(0, 10),
          procedimento: j.procedimentoCodigo,
        })),
        detalhesPulados: pulados.slice(0, 30),
      };
    }

    let criadas = 0;
    const criadasSample: Array<{ codigo: string; tag: string; tipo: string; abertura: string }> = [];

    for (const job of finalJobs) {
      const chave = chaveUnicaPlano(job.tipoTeste as unknown as TipoAtividadePlano);
      const plano = await this.prisma.planoInstancia.findUnique({
        where: { equipamentoId_chaveUnica: { equipamentoId: job.equipamentoId, chaveUnica: chave } },
      });
      if (!plano) continue;
      if (!plano.proximaData) {
        await this.prisma.planoInstancia.update({
          where: { id: plano.id },
          data: { proximaData: job.abertura, dataPrevistaOriginal: job.abertura },
        });
      }
      const refreshed = await this.prisma.planoInstancia.findUnique({ where: { id: plano.id } });
      if (!refreshed) continue;
      const oc = await ensureOcorrenciaAberta(this.prisma, refreshed, inicio);
      if (!oc) continue;
      const gerada = await gerarOsDaOcorrencia(this.prisma, oc.id, { usuarioId: opts.usuarioId });
      if (gerada.osId && !gerada.pulada && !gerada.falha) {
        criadas += 1;
        if (criadasSample.length < 25) {
          criadasSample.push({
            codigo: gerada.codigo ?? "",
            tag: job.tag,
            tipo: job.tipoTeste,
            abertura: job.abertura.toISOString().slice(0, 10),
          });
        }
      } else if (gerada.pulada) {
        pulados.push({ tag: job.tag, tipo: job.tipoTeste, motivo: gerada.motivo ?? "Pulada" });
      }
    }

    return {
      dryRun: false,
      inicio: inicio.toISOString(),
      fim: addDays(inicio, horizonteDias - 1).toISOString(),
      horizonteDias,
      periodicidadeMeses: forcarAnual ? 12 : null,
      forcarAnual,
      equipamentosComPlano: equipamentos.length - semPlano,
      equipamentosSemTeste: semPlano,
      semPeriodicidade,
      osCriadas: criadas,
      pulados: pulados.length,
      porTipo,
      amostra: criadasSample,
      detalhesPulados: pulados.slice(0, 30),
    };
  }

  async calendario(
    estabelecimentoId: string,
    opts: { de?: string; ate?: string; tipos?: TipoOS[] } = {},
  ) {
    const agora = new Date();
    const year = agora.getFullYear();
    const de = opts.de ? startOfDay(new Date(opts.de)) : startOfDay(new Date(year, 0, 1));
    const ate = opts.ate ? startOfDay(new Date(opts.ate)) : startOfDay(new Date(year, 11, 31));
    ate.setHours(23, 59, 59, 999);

    const tipos =
      opts.tipos?.length
        ? opts.tipos
        : [TipoOS.PREVENTIVA, TipoOS.CALIBRACAO, TipoOS.TSE, TipoOS.QUALIFICACAO];

    const os = await this.prisma.ordemServico.findMany({
      where: {
        estabelecimentoId,
        tipo: { in: tipos },
        abertura: { gte: de, lte: ate },
      },
      include: {
        equipamento: { select: { tag: true, nome: true, setor: { select: { nome: true } } } },
        setor: { select: { nome: true } },
      },
      orderBy: [{ abertura: "asc" }, { numero: "asc" }],
    });

    const eventos = os.map((o) => {
      const d = o.abertura;
      const iso = d.toISOString().slice(0, 10);
      return {
        id: o.id,
        codigo: o.codigo ?? `OS-${o.numero}`,
        tipo: o.tipo,
        status: o.status,
        abertura: iso,
        mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        semana: isoWeek(d),
        diaSemana: d.getDay(),
        tag: o.equipamento?.tag ?? "—",
        equipamento: o.equipamento?.nome ?? "Chamado do setor",
        setor: o.equipamento?.setor?.nome ?? o.setor?.nome ?? "—",
        pendencia: o.pendencia,
      };
    });

    const porMes = groupCount(eventos, (e) => e.mes);
    const porSemana = groupCount(eventos, (e) => e.semana);
    const porTipo = groupCount(eventos, (e) => e.tipo);
    const porDia = groupCount(eventos, (e) => e.abertura);

    const anual = Array.from({ length: 12 }, (_, i) => {
      const keySuffix = `-${String(i + 1).padStart(2, "0")}`;
      const doMes = eventos.filter((e) => e.mes.endsWith(keySuffix));
      return {
        mes: i + 1,
        label: MES_LABEL[i],
        total: doMes.length,
        porTipo: groupCount(doMes, (e) => e.tipo),
      };
    });

    return {
      de: de.toISOString().slice(0, 10),
      ate: ate.toISOString().slice(0, 10),
      total: eventos.length,
      porTipo,
      porMes,
      porSemana,
      porDia,
      anual,
      eventos,
    };
  }

  async agenda(
    estabelecimentoId: string,
    opts: {
      de?: string;
      ate?: string;
      tipo?: string;
      status?: string;
      setorId?: string;
      q?: string;
      executorTipo?: string;
    } = {},
  ) {
    const agora = new Date();
    const year = agora.getFullYear();
    const de = opts.de ? startOfDay(new Date(`${opts.de}T00:00:00`)) : startOfDay(new Date(year, 0, 1));
    const ate = opts.ate ? startOfDay(new Date(`${opts.ate}T00:00:00`)) : startOfDay(new Date(year, 11, 31));
    ate.setHours(23, 59, 59, 999);

    const planoWhere: {
      tipo?: TipoAtividadePlano;
      executorTipo?: ExecutorPlano;
      equipamento?: {
        setorId?: string;
        OR?: Array<{ tag: { contains: string; mode: "insensitive" } } | { nome: { contains: string; mode: "insensitive" } }>;
      };
    } = {};
    if (opts.tipo && opts.tipo !== "TODOS") planoWhere.tipo = opts.tipo as TipoAtividadePlano;
    if (opts.executorTipo) planoWhere.executorTipo = opts.executorTipo as ExecutorPlano;
    if (opts.setorId) planoWhere.equipamento = { ...(planoWhere.equipamento ?? {}), setorId: opts.setorId };
    if (opts.q) {
      planoWhere.equipamento = {
        ...(planoWhere.equipamento ?? {}),
        OR: [
          { tag: { contains: opts.q, mode: "insensitive" } },
          { nome: { contains: opts.q, mode: "insensitive" } },
        ],
      };
    }

    const rows = await this.prisma.planoOcorrencia.findMany({
      where: {
        estabelecimentoId,
        dataPrevista: { gte: de, lte: ate },
        ...(Object.keys(planoWhere).length ? { plano: planoWhere } : {}),
      },
      include: {
        os: { select: { id: true, numero: true, codigo: true, status: true } },
        executor: { select: { id: true, nome: true } },
        fornecedorExec: { select: { id: true, nome: true } },
        plano: {
          include: {
            equipamento: { select: { tag: true, nome: true, setor: { select: { id: true, nome: true } } } },
            tipoCustom: { select: { nome: true } },
            responsavel: { select: { id: true, nome: true } },
            fornecedor: { select: { id: true, nome: true } },
            grupo: { select: { id: true, nome: true } },
          },
        },
      },
      orderBy: [{ dataPrevista: "asc" }],
      take: 2000,
    });

    const itens = rows.map((oc) => {
      const status = classificarAgenda(oc.dataPrevista, oc.plano.antecedenciaDias, agora, {
        osId: oc.osId,
        executada: Boolean(oc.executadaEm),
        cumpriu: oc.cumpriuPlano,
        cancelada: oc.status === "CANCELADA",
      });
      const atraso = calcularAtrasoDias(oc.dataPrevistaOriginal, agora, oc.executadaEm);
      const tipoLabel =
        oc.plano.tipo === "OUTRO" ? oc.plano.tipoCustom?.nome ?? "Outro" : oc.plano.tipo;
      return {
        id: oc.id,
        planoId: oc.planoInstanciaId,
        tipo: oc.plano.tipo,
        tipoLabel,
        status,
        dataPrevista: oc.dataPrevista.toISOString().slice(0, 10),
        dataPrevistaOriginal: oc.dataPrevistaOriginal.toISOString().slice(0, 10),
        atrasoDias: atraso,
        reprogramada: Boolean(oc.motivoReprogramacao),
        motivoReprogramacao: oc.motivoReprogramacao,
        cumpriuPlano: oc.cumpriuPlano,
        executadaEm: oc.executadaEm?.toISOString() ?? null,
        resultado: oc.resultado,
        executorTipo: oc.plano.executorTipo,
        executorNome: oc.executor?.nome ?? oc.executorNome,
        fornecedor: oc.fornecedorExec?.nome ?? oc.plano.fornecedor?.nome ?? null,
        responsavel: oc.plano.responsavel?.nome ?? null,
        responsavelId: oc.plano.responsavelId,
        grupo: oc.plano.grupo?.nome ?? null,
        os: oc.os
          ? { id: oc.os.id, codigo: oc.os.codigo ?? `OS-${oc.os.numero}`, status: oc.os.status }
          : null,
        osGeracaoStatus: oc.osGeracaoStatus,
        osGeracaoErro: oc.osGeracaoErro,
        tag: oc.plano.equipamento.tag,
        equipamento: oc.plano.equipamento.nome,
        setor: oc.plano.equipamento.setor.nome,
        setorId: oc.plano.equipamento.setor.id,
        procedimentoCodigo: oc.plano.procedimentoCodigo,
        periodicidadeMeses: oc.plano.periodicidadeMeses,
        modoAgendamento: oc.plano.modoAgendamento,
        fontePeriodicidade: oc.plano.fontePeriodicidade,
      };
    });

    const filtrados = opts.status && opts.status !== "TODOS" ? itens.filter((i) => i.status === opts.status) : itens;

    return {
      de: de.toISOString().slice(0, 10),
      ate: ate.toISOString().slice(0, 10),
      total: filtrados.length,
      contagem: {
        PREVISTA: filtrados.filter((i) => i.status === "PREVISTA").length,
        A_VENCER: filtrados.filter((i) => i.status === "A_VENCER").length,
        VENCIDA: filtrados.filter((i) => i.status === "VENCIDA").length,
        OS_GERADA: filtrados.filter((i) => i.status === "OS_GERADA").length,
        EXECUTADA: filtrados.filter((i) => i.status === "EXECUTADA").length,
      },
      itens: filtrados,
    };
  }

  async sincronizar(user: AuthUser) {
    assertPodeEditar(user);
    return sincronizarInstanciasCatalogo(this.prisma, user.estabelecimentoId, { usuarioId: user.userId });
  }

  async gerarPendentes(user: AuthUser, soFalhas = false) {
    assertPodeEditar(user);
    return gerarOsPendentes(this.prisma, user.estabelecimentoId, {
      usuarioId: user.userId,
      soFalhas,
    });
  }

  async gerarOcorrencia(user: AuthUser, ocorrenciaId: string) {
    assertPodeEditar(user);
    const oc = await this.prisma.planoOcorrencia.findFirst({
      where: { id: ocorrenciaId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!oc) throw new NotFoundException("Ocorrência não encontrada");
    return gerarOsDaOcorrencia(this.prisma, oc.id, { usuarioId: user.userId });
  }

  async reprogramar(user: AuthUser, ocorrenciaId: string, novaData: string, motivo: string) {
    assertPodeEditar(user);
    const oc = await this.prisma.planoOcorrencia.findFirst({
      where: { id: ocorrenciaId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!oc) throw new NotFoundException("Ocorrência não encontrada");
    try {
      return await reprogramarOcorrencia(
        this.prisma,
        oc.id,
        startOfDay(new Date(`${novaData}T00:00:00`)),
        motivo,
        user.userId,
      );
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : "Falha ao reprogramar");
    }
  }

  async tiposCustom(estabelecimentoId: string) {
    return this.prisma.planoTipoCustom.findMany({
      where: { estabelecimentoId, ativo: true },
      orderBy: { nome: "asc" },
    });
  }

  async criarTipoCustom(user: AuthUser, nome: string) {
    assertPodeEditar(user);
    const n = nome.trim();
    if (n.length < 2) throw new BadRequestException("Informe o nome do tipo");
    return this.prisma.planoTipoCustom.upsert({
      where: { estabelecimentoId_nome: { estabelecimentoId: user.estabelecimentoId, nome: n } },
      update: { ativo: true },
      create: { estabelecimentoId: user.estabelecimentoId, nome: n },
    });
  }

  async upsertPlano(user: AuthUser, input: UpsertPlanoInput) {
    assertPodeEditar(user);
    if (!input.equipamentoId && !input.modeloId) {
      throw new BadRequestException("Informe o equipamento ou o modelo");
    }
    if (input.periodicidadeMeses != null && input.periodicidadeMeses < 1) {
      throw new BadRequestException("Periodicidade, se informada, deve ser de pelo menos 1 mês");
    }
    if (input.modoAgendamento === "CALENDARIO_FIXO" && !input.diaFixo) {
      throw new BadRequestException("Calendário fixo exige o dia de referência");
    }

    let tipoCustomId: string | null = null;
    if (input.tipo === "OUTRO") {
      const nome = input.tipoCustomNome?.trim();
      if (!nome) throw new BadRequestException("Informe o nome do tipo configurável");
      const custom = await this.criarTipoCustom(user, nome);
      tipoCustomId = custom.id;
    }

    let grupoId: string | null = null;
    if (input.grupoNome?.trim()) {
      const g = await this.prisma.planoGrupo.upsert({
        where: {
          estabelecimentoId_nome: {
            estabelecimentoId: user.estabelecimentoId,
            nome: input.grupoNome.trim(),
          },
        },
        update: { ativo: true },
        create: { estabelecimentoId: user.estabelecimentoId, nome: input.grupoNome.trim() },
      });
      grupoId = g.id;
    }

    const alvoIds: string[] = [];
    let modeloOrigemId: string | null = null;
    if (input.equipamentoId) {
      const eq = await this.prisma.equipamento.findFirst({
        where: { id: input.equipamentoId, estabelecimentoId: user.estabelecimentoId },
      });
      if (!eq) throw new NotFoundException("Equipamento não encontrado");
      alvoIds.push(eq.id);
    } else if (input.modeloId) {
      modeloOrigemId = input.modeloId;
      const eqs = await this.prisma.equipamento.findMany({
        where: {
          estabelecimentoId: user.estabelecimentoId,
          modeloId: input.modeloId,
          situacao: { not: SituacaoEquipamento.ARQUIVADO },
        },
        select: { id: true },
      });
      if (eqs.length === 0) throw new BadRequestException("Nenhum equipamento ativo neste modelo");
      alvoIds.push(...eqs.map((e) => e.id));
    }

    const chave = chaveUnicaPlano(input.tipo, tipoCustomId);
    const proxima = input.proximaData ? startOfDayRegra(new Date(`${input.proximaData}T00:00:00`)) : null;
    const criados = [];

    for (const equipamentoId of alvoIds) {
      const data = {
        tipo: input.tipo,
        tipoCustomId,
        chaveUnica: chave,
        grupoId,
        modeloOrigemId,
        periodicidadeMeses: input.periodicidadeMeses ?? null,
        fontePeriodicidade: input.fontePeriodicidade ?? null,
        fontePeriodicidadeObs: input.fontePeriodicidadeObs?.trim() || null,
        modoAgendamento: input.modoAgendamento ?? ModoAgendamentoPlano.INTERVALO_EXECUCAO,
        diaFixo: input.diaFixo ?? null,
        mesFixo: input.mesFixo ?? null,
        antecedenciaDias: input.antecedenciaDias ?? 15,
        proximaData: proxima,
        dataPrevistaOriginal: proxima,
        responsavelId: input.responsavelId ?? null,
        executorTipo: input.executorTipo ?? ExecutorPlano.INTERNO,
        fornecedorId: input.fornecedorId ?? null,
        procedimentoCodigo: input.procedimentoCodigo?.trim() || null,
        editadoManualmente: true,
        status: StatusPlanoInstancia.ATIVO,
        motivoSuspensao: null,
        suspensoEm: null,
      };

      const row = await this.prisma.planoInstancia.upsert({
        where: { equipamentoId_chaveUnica: { equipamentoId, chaveUnica: chave } },
        create: {
          estabelecimentoId: user.estabelecimentoId,
          equipamentoId,
          ...data,
        },
        update: data,
      });
      await this.prisma.planoHistorico.create({
        data: {
          planoInstanciaId: row.id,
          usuarioId: user.userId,
          acao: "UPSERT",
          detalhe: JSON.stringify({
            tipo: input.tipo,
            periodicidadeMeses: input.periodicidadeMeses ?? null,
            proximaData: proxima?.toISOString().slice(0, 10) ?? null,
          }),
        },
      });
      if (row.proximaData) await ensureOcorrenciaAberta(this.prisma, row);
      criados.push(row);
    }

    return { count: criados.length, ids: criados.map((c) => c.id) };
  }

  async alterarStatusPlano(
    user: AuthUser,
    planoId: string,
    status: StatusPlanoInstancia,
    motivo?: string,
  ) {
    assertPodeEditar(user);
    const plano = await this.prisma.planoInstancia.findFirst({
      where: { id: planoId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!plano) throw new NotFoundException();
    if (status !== StatusPlanoInstancia.ATIVO && !motivo?.trim()) {
      throw new BadRequestException("Informe o motivo da suspensão ou desativação");
    }
    const updated = await this.prisma.planoInstancia.update({
      where: { id: plano.id },
      data: {
        status,
        motivoSuspensao: status === StatusPlanoInstancia.ATIVO ? null : motivo!.trim(),
        suspensoEm: status === StatusPlanoInstancia.ATIVO ? null : new Date(),
        suspensoPorId: status === StatusPlanoInstancia.ATIVO ? null : user.userId,
        editadoManualmente: true,
      },
    });
    await this.prisma.planoHistorico.create({
      data: {
        planoInstanciaId: plano.id,
        usuarioId: user.userId,
        acao: status,
        detalhe: motivo?.trim() ?? null,
      },
    });
    return updated;
  }

  async historico(user: AuthUser, planoId: string) {
    const plano = await this.prisma.planoInstancia.findFirst({
      where: { id: planoId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!plano) throw new NotFoundException();
    return this.prisma.planoHistorico.findMany({
      where: { planoInstanciaId: plano.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async ocorrenciaDetalhe(user: AuthUser, id: string) {
    const oc = await this.prisma.planoOcorrencia.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
      include: {
        os: { include: { anexos: { select: { id: true, nomeArquivo: true, createdAt: true } } } },
        laudo: { select: { id: true, numero: true, resultado: true, dataExecucao: true } },
        plano: {
          include: {
            equipamento: { select: { tag: true, nome: true } },
            historico: { orderBy: { createdAt: "desc" }, take: 30 },
            tipoCustom: true,
            grupo: true,
          },
        },
      },
    });
    if (!oc) throw new NotFoundException();
    return oc;
  }

  async distribuir(user: AuthUser, colaboradorIds: string[], de?: string, ate?: string) {
    assertPodeEditar(user);
    const ids = colaboradorIds.map((s) => s.trim()).filter(Boolean);
    if (ids.length !== 2) {
      throw new BadRequestException("Informe exatamente dois profissionais");
    }
    const cols = await this.prisma.colaborador.findMany({
      where: { estabelecimentoId: user.estabelecimentoId, id: { in: ids }, ativo: true },
    });
    if (cols.length !== 2) throw new BadRequestException("Os dois profissionais precisam estar ativos");

    const year = new Date().getFullYear();
    const ini = de ? startOfDay(new Date(`${de}T00:00:00`)) : startOfDay(new Date());
    const fim = ate ? startOfDay(new Date(`${ate}T00:00:00`)) : startOfDay(new Date(year, 11, 31));
    fim.setHours(23, 59, 59, 999);

    const ocs = await this.prisma.planoOcorrencia.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        cumpriuPlano: false,
        status: { not: "CANCELADA" },
        dataPrevista: { gte: ini, lte: fim },
      },
      include: { plano: true },
      orderBy: [{ dataPrevista: "asc" }, { id: "asc" }],
    });

    let i = 0;
    let atualizados = 0;
    for (const oc of ocs) {
      const colabId = ids[i % 2];
      i += 1;
      await this.prisma.planoInstancia.update({
        where: { id: oc.planoInstanciaId },
        data: { responsavelId: colabId },
      });
      if (oc.osId) {
        await this.prisma.ordemServico.update({
          where: { id: oc.osId },
          data: { responsavelId: colabId, status: StatusOS.ABERTA },
        });
      }
      atualizados += 1;
    }

    return { distribuidas: atualizados, profissionais: cols.map((c) => ({ id: c.id, nome: c.nome })) };
  }

  registrarExecucao = registrarExecucaoPlano;
}

const MES_LABEL = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function groupCount<T>(items: T[], keyFn: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const k = keyFn(it);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
