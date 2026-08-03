/**
 * Gera OS de plano (preventiva / TSE / calibração) condensadas no horizonte de ramp-up.
 */
import {
  PrioridadeOS,
  SituacaoEquipamento,
  StatusOS,
  TipoOS,
  TipoTestePlano,
} from "@prisma/client";
import { ForbiddenException, Injectable } from "@nestjs/common";
import { podeEditarCadastros } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";
import { tipoOsFromLaudo } from "./proxima-os-plano";

const TIPOS_RAMPUP: TipoTestePlano[] = [
  TipoTestePlano.PREVENTIVA,
  TipoTestePlano.CALIBRACAO,
  TipoTestePlano.TSE,
];

const PERIODICIDADE_ANUAL_MESES = 12;

export type RampUpOptions = {
  horizonteDias?: number;
  inicio?: Date;
  forcarAnual?: boolean;
  dryRun?: boolean;
};

type Job = {
  equipamentoId: string;
  tag: string;
  nome: string;
  setor: string;
  tipoTeste: TipoTestePlano;
  tipoOs: TipoOS;
  procedimentoCodigo: string;
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

/** Espalha índices 0..n-1 em [0, horizonteDias-1], evitando fins de semana quando possível. */
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

@Injectable()
export class PlanosService {
  constructor(private readonly prisma: PrismaService) {}

  previewRampUp(estabelecimentoId: string, opts: RampUpOptions = {}) {
    return this.gerarRampUpInternal(estabelecimentoId, { ...opts, dryRun: true });
  }

  async gerarRampUp(user: AuthUser, opts: RampUpOptions = {}) {
    if (!podeEditarCadastros(user.perfil)) throw new ForbiddenException();
    return this.gerarRampUpInternal(user.estabelecimentoId, { ...opts, dryRun: false });
  }

  private async gerarRampUpInternal(estabelecimentoId: string, opts: RampUpOptions) {
    const horizonteDias = opts.horizonteDias ?? 90;
    const inicio = startOfDay(opts.inicio ?? new Date());
    const forcarAnual = opts.forcarAnual !== false;
    const dryRun = Boolean(opts.dryRun);

    if (forcarAnual && !dryRun) {
      await this.prisma.planoTeste.updateMany({
        where: {
          tipoTeste: { in: TIPOS_RAMPUP },
          tipoEquipamentoPlano: { estabelecimentoId },
          ativo: true,
        },
        data: { periodicidadeMeses: PERIODICIDADE_ANUAL_MESES },
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
            testes: {
              where: { ativo: true, tipoTeste: { in: TIPOS_RAMPUP } },
            },
          },
        },
      },
      orderBy: [{ setor: { nome: "asc" } }, { tag: "asc" }],
    });

    const jobs: Job[] = [];
    let semPlano = 0;
    for (const eq of equipamentos) {
      const testes = eq.tipoEquipamentoPlano?.testes ?? [];
      if (testes.length === 0) {
        semPlano += 1;
        continue;
      }
      for (const t of testes) {
        jobs.push({
          equipamentoId: eq.id,
          tag: eq.tag,
          nome: eq.nome,
          setor: eq.setor.nome,
          tipoTeste: t.tipoTeste,
          tipoOs: tipoOsFromLaudo(t.tipoTeste),
          procedimentoCodigo: t.procedimentoCodigo,
        });
      }
    }

    const abertas = await this.prisma.ordemServico.findMany({
      where: {
        estabelecimentoId,
        tipo: { in: [TipoOS.PREVENTIVA, TipoOS.CALIBRACAO, TipoOS.TSE] },
        status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] },
      },
      select: { equipamentoId: true, tipo: true },
    });
    const chaveAberta = new Set(abertas.map((o) => `${o.equipamentoId}|${o.tipo}`));

    const pulados: Array<{ tag: string; tipo: string; motivo: string }> = [];
    const candidatos = jobs.filter((job) => {
      const key = `${job.equipamentoId}|${job.tipoOs}`;
      if (chaveAberta.has(key)) {
        pulados.push({
          tag: job.tag,
          tipo: job.tipoTeste,
          motivo: "Já existe OS aberta deste tipo",
        });
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
    };

    if (dryRun) {
      return {
        dryRun: true,
        inicio: inicio.toISOString(),
        fim: addDays(inicio, horizonteDias - 1).toISOString(),
        horizonteDias,
        periodicidadeMeses: PERIODICIDADE_ANUAL_MESES,
        equipamentosComPlano: equipamentos.length - semPlano,
        equipamentosSemTeste: semPlano,
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
    const criadasSample: Array<{ codigo: string; tag: string; tipo: string; abertura: string }> =
      [];

    await this.prisma.$transaction(
      async (tx) => {
        for (const job of finalJobs) {
          const row = await tx.contadorSequencia.upsert({
            where: {
              estabelecimentoId_chave: { estabelecimentoId, chave: "OS" },
            },
            create: { estabelecimentoId, chave: "OS", valor: 1 },
            update: { valor: { increment: 1 } },
          });
          const numero = row.valor;
          const codigo = `OS-${String(numero).padStart(4, "0")}`;
          await tx.ordemServico.create({
            data: {
              estabelecimentoId,
              numero,
              codigo,
              equipamentoId: job.equipamentoId,
              tipo: job.tipoOs,
              prioridade: PrioridadeOS.MEDIA,
              status: StatusOS.ABERTA,
              abertura: job.abertura,
              pendencia: "Ramp-up hospital (plano anual condensado em 3 meses)",
              observacaoRequisicao: [
                `Plano ${job.tipoTeste} · periodicidade ${PERIODICIDADE_ANUAL_MESES} meses`,
                `Procedimento ${job.procedimentoCodigo}`,
                `Setor ${job.setor}`,
              ].join(" · "),
            },
          });
          criadas += 1;
          if (criadasSample.length < 25) {
            criadasSample.push({
              codigo,
              tag: job.tag,
              tipo: job.tipoTeste,
              abertura: job.abertura.toISOString().slice(0, 10),
            });
          }
        }
      },
      { timeout: 120_000 },
    );

    return {
      dryRun: false,
      inicio: inicio.toISOString(),
      fim: addDays(inicio, horizonteDias - 1).toISOString(),
      horizonteDias,
      periodicidadeMeses: PERIODICIDADE_ANUAL_MESES,
      equipamentosComPlano: equipamentos.length - semPlano,
      equipamentosSemTeste: semPlano,
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
    const ate = opts.ate
      ? startOfDay(new Date(opts.ate))
      : startOfDay(new Date(year, 11, 31));
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
        equipamento: {
          select: {
            tag: true,
            nome: true,
            setor: { select: { nome: true } },
          },
        },
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
        tag: o.equipamento.tag,
        equipamento: o.equipamento.nome,
        setor: o.equipamento.setor.nome,
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
