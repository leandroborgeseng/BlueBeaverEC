/**
 * Persistência de ocorrências do plano. Não cria OS duplicada ao rerodar.
 * Corretiva não cumpre o ciclo. Reprovado não avança a próxima data.
 */
import {
  PrioridadeOS,
  type PrismaClient,
  ResultadoLaudo,
  StatusGeracaoOsPlano,
  StatusOS,
  StatusOcorrenciaPlano,
  StatusPlanoInstancia,
  TipoAtividadePlano,
  TipoOS,
} from "@prisma/client";
import {
  aplicarReprogramacao,
  calcularAtrasoDias,
  calcularProximaData,
  chaveUnicaPlano,
  classificarAgenda,
  devePularGeracaoOs,
  grupoEstaCumprido,
  noPrazoDeGeracao,
  resultadoLiberaProximaData,
  startOfDay,
  tipoOsCumprePlano,
  tipoOsDaAtividade,
} from "./plano-regras";

export type PrismaPlanos = Pick<
  PrismaClient,
  | "contadorSequencia"
  | "ordemServico"
  | "planoInstancia"
  | "planoOcorrencia"
  | "planoHistorico"
  | "planoGrupo"
  | "planoTipoCustom"
  | "planoTeste"
  | "equipamento"
  | "laudo"
>;

const STATUS_OS_ABERTAS: StatusOS[] = [
  StatusOS.NAO_ATRIBUIDA,
  StatusOS.ABERTA,
  StatusOS.EM_ANDAMENTO,
  StatusOS.AGUARDANDO,
];

export function tipoOsFromLaudo(tipo: string): TipoOS {
  const t = tipoOsDaAtividade(tipo);
  return TipoOS[t];
}

async function nextOsNumero(prisma: PrismaPlanos, estabId: string) {
  const row = await prisma.contadorSequencia.upsert({
    where: { estabelecimentoId_chave: { estabelecimentoId: estabId, chave: "OS" } },
    create: { estabelecimentoId: estabId, chave: "OS", valor: 1 },
    update: { valor: { increment: 1 } },
  });
  return row.valor;
}

async function historico(
  prisma: PrismaPlanos,
  planoInstanciaId: string,
  acao: string,
  detalhe?: string,
  usuarioId?: string | null,
) {
  await prisma.planoHistorico.create({
    data: { planoInstanciaId, acao, detalhe: detalhe ?? null, usuarioId: usuarioId ?? null },
  });
}

export async function ensureOcorrenciaAberta(
  prisma: PrismaPlanos,
  plano: {
    id: string;
    estabelecimentoId: string;
    proximaData: Date | null;
    dataPrevistaOriginal: Date | null;
    antecedenciaDias: number;
  },
  agora = new Date(),
) {
  if (!plano.proximaData) return null;
  const prevista = startOfDay(plano.proximaData);
  const original = startOfDay(plano.dataPrevistaOriginal ?? prevista);

  const existente = await prisma.planoOcorrencia.findUnique({
    where: {
      planoInstanciaId_dataPrevistaOriginal: {
        planoInstanciaId: plano.id,
        dataPrevistaOriginal: original,
      },
    },
  });
  if (existente) {
    const atraso = calcularAtrasoDias(original, agora, existente.executadaEm);
    const status = classificarAgenda(existente.dataPrevista, plano.antecedenciaDias, agora, {
      osId: existente.osId,
      executada: Boolean(existente.executadaEm),
      cumpriu: existente.cumpriuPlano,
      cancelada: existente.status === StatusOcorrenciaPlano.CANCELADA,
    });
    if (
      existente.atrasoDias !== atraso ||
      (existente.status !== status && existente.status !== StatusOcorrenciaPlano.CANCELADA)
    ) {
      return prisma.planoOcorrencia.update({
        where: { id: existente.id },
        data: {
          atrasoDias: atraso,
          ...(existente.status === StatusOcorrenciaPlano.CANCELADA ? {} : { status }),
        },
      });
    }
    return existente;
  }

  const status = classificarAgenda(prevista, plano.antecedenciaDias, agora);
  return prisma.planoOcorrencia.create({
    data: {
      planoInstanciaId: plano.id,
      estabelecimentoId: plano.estabelecimentoId,
      dataPrevista: prevista,
      dataPrevistaOriginal: original,
      atrasoDias: calcularAtrasoDias(original, agora),
      status,
    },
  });
}

async function osAbertaMesmoTipo(
  prisma: PrismaPlanos,
  estabelecimentoId: string,
  equipamentoId: string,
  tipoOs: TipoOS,
  exceptOsId?: string | null,
) {
  const found = await prisma.ordemServico.findFirst({
    where: {
      estabelecimentoId,
      equipamentoId,
      tipo: tipoOs,
      status: { in: STATUS_OS_ABERTAS },
      ...(exceptOsId ? { id: { not: exceptOsId } } : {}),
    },
    select: { id: true, numero: true, codigo: true },
  });
  return found;
}

export async function gerarOsDaOcorrencia(
  prisma: PrismaPlanos,
  ocorrenciaId: string,
  opts: { usuarioId?: string | null; forcar?: boolean } = {},
): Promise<{
  ocorrenciaId: string;
  osId?: string;
  codigo?: string;
  pulada?: boolean;
  motivo?: string;
  falha?: string;
}> {
  const oc = await prisma.planoOcorrencia.findUnique({
    where: { id: ocorrenciaId },
    include: {
      plano: {
        include: {
          equipamento: { select: { id: true, tag: true, nome: true, setorId: true } },
          tipoCustom: { select: { nome: true } },
        },
      },
    },
  });
  if (!oc) return { ocorrenciaId, falha: "Ocorrência não encontrada" };

  const plano = oc.plano;
  const tipoOs = tipoOsFromLaudo(plano.tipo);
  const ativo = plano.status === StatusPlanoInstancia.ATIVO;

  if (oc.osId) {
    return { ocorrenciaId, osId: oc.osId, pulada: true, motivo: "Já existe OS desta ocorrência" };
  }

  const aberta = await osAbertaMesmoTipo(prisma, oc.estabelecimentoId, plano.equipamentoId, tipoOs);
  const skip = devePularGeracaoOs({
    osId: oc.osId,
    existeOsAbertaMesmoTipo: Boolean(aberta),
    planoAtivo: ativo,
  });
  if (skip.pular && aberta && !oc.osId) {
    await prisma.planoOcorrencia.update({
      where: { id: oc.id },
      data: {
        osId: aberta.id,
        osGeracaoStatus: StatusGeracaoOsPlano.OK,
        osGeracaoErro: null,
        status: StatusOcorrenciaPlano.OS_GERADA,
      },
    });
    return {
      ocorrenciaId,
      osId: aberta.id,
      codigo: aberta.codigo ?? `OS-${aberta.numero}`,
      pulada: true,
      motivo: "OS aberta existente vinculada (sem duplicar)",
    };
  }
  if (skip.pular) {
    return { ocorrenciaId, pulada: true, motivo: skip.motivo };
  }

  try {
    const numero = await nextOsNumero(prisma, oc.estabelecimentoId);
    const codigo = `OS-${String(numero).padStart(5, "0")}`;
    const tipoLabel =
      plano.tipo === TipoAtividadePlano.OUTRO
        ? plano.tipoCustom?.nome ?? "Outro"
        : plano.tipo;
    const os = await prisma.ordemServico.create({
      data: {
        estabelecimentoId: oc.estabelecimentoId,
        numero,
        codigo,
        equipamentoId: plano.equipamentoId,
        setorId: plano.equipamento.setorId,
        tipo: tipoOs,
        prioridade: PrioridadeOS.MEDIA,
        status: plano.responsavelId ? StatusOS.ABERTA : StatusOS.NAO_ATRIBUIDA,
        abertura: new Date(),
        responsavelId: plano.responsavelId,
        pendencia: `Plano ${tipoLabel} · prevista ${startOfDay(oc.dataPrevista).toISOString().slice(0, 10)}`,
        observacaoRequisicao: [
          `Gerada do plano de manutenção (${tipoLabel})`,
          plano.procedimentoCodigo ? `POP ${plano.procedimentoCodigo}` : null,
          plano.executorTipo === "EXTERNO" ? "Executor externo" : "Executor interno",
          oc.atrasoDias > 0 ? `Atraso explícito: ${oc.atrasoDias} dia(s) em relação a ${startOfDay(oc.dataPrevistaOriginal).toISOString().slice(0, 10)}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      },
    });
    await prisma.planoOcorrencia.update({
      where: { id: oc.id },
      data: {
        osId: os.id,
        osGeracaoStatus: StatusGeracaoOsPlano.OK,
        osGeracaoErro: null,
        osGeracaoTentativas: { increment: 1 },
        status: StatusOcorrenciaPlano.OS_GERADA,
      },
    });
    await historico(
      prisma,
      plano.id,
      "OS_GERADA",
      `${codigo} · ocorrência ${startOfDay(oc.dataPrevistaOriginal).toISOString().slice(0, 10)}`,
      opts.usuarioId,
    );
    return { ocorrenciaId, osId: os.id, codigo };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao gerar OS";
    await prisma.planoOcorrencia.update({
      where: { id: oc.id },
      data: {
        osGeracaoStatus: StatusGeracaoOsPlano.FALHA,
        osGeracaoErro: msg.slice(0, 500),
        osGeracaoTentativas: { increment: 1 },
      },
    });
    return { ocorrenciaId, falha: msg };
  }
}

export async function gerarOsPendentes(
  prisma: PrismaPlanos,
  estabelecimentoId: string,
  opts: { usuarioId?: string | null; soFalhas?: boolean; agora?: Date } = {},
) {
  const agora = opts.agora ?? new Date();
  const planos = await prisma.planoInstancia.findMany({
    where: { estabelecimentoId, status: StatusPlanoInstancia.ATIVO },
  });
  const resultados: Array<Awaited<ReturnType<typeof gerarOsDaOcorrencia>>> = [];
  for (const plano of planos) {
    const oc = await ensureOcorrenciaAberta(prisma, plano, agora);
    if (!oc || oc.cumpriuPlano || oc.status === StatusOcorrenciaPlano.CANCELADA) continue;
    if (opts.soFalhas && oc.osGeracaoStatus !== StatusGeracaoOsPlano.FALHA) continue;
    if (oc.osId && oc.osGeracaoStatus !== StatusGeracaoOsPlano.FALHA) continue;
    if (!opts.soFalhas && !noPrazoDeGeracao(oc.dataPrevista, plano.antecedenciaDias, agora)) continue;
    resultados.push(await gerarOsDaOcorrencia(prisma, oc.id, { usuarioId: opts.usuarioId }));
  }
  return {
    processadas: resultados.length,
    criadas: resultados.filter((r) => r.osId && !r.pulada && !r.falha).length,
    vinculadas: resultados.filter((r) => r.pulada && r.osId).length,
    puladas: resultados.filter((r) => r.pulada && !r.osId).length,
    falhas: resultados.filter((r) => r.falha).length,
    detalhes: resultados.slice(0, 40),
  };
}

async function avancarSeGrupoPermitir(
  prisma: PrismaPlanos,
  plano: {
    id: string;
    grupoId: string | null;
    modoAgendamento: "CALENDARIO_FIXO" | "INTERVALO_EXECUCAO";
    periodicidadeMeses: number | null;
    diaFixo: number | null;
    mesFixo: number | null;
  },
  dataExecucao: Date,
  usuarioId?: string | null,
) {
  const next = calcularProximaData({
    modo: plano.modoAgendamento,
    periodicidadeMeses: plano.periodicidadeMeses,
    diaFixo: plano.diaFixo,
    mesFixo: plano.mesFixo,
    dataExecucao,
  });

  if (plano.grupoId) {
    const irmaos = await prisma.planoInstancia.findMany({
      where: { grupoId: plano.grupoId, status: StatusPlanoInstancia.ATIVO },
      include: {
        ocorrencias: {
          where: { cumpriuPlano: false, status: { not: StatusOcorrenciaPlano.CANCELADA } },
          take: 1,
        },
      },
    });
    const estados = irmaos.map((p) => ({
      cumpriu: p.id === plano.id ? true : p.ocorrencias.length === 0,
    }));
    if (!grupoEstaCumprido(estados)) {
      await historico(
        prisma,
        plano.id,
        "AGUARDANDO_GRUPO",
        "Atividade executada; o ciclo do grupo só fecha quando todas forem aprovadas",
        usuarioId,
      );
      return { avanco: false, motivo: "grupo_incompleto" as const, proximaData: next };
    }
    for (const irmao of irmaos) {
      const nextIrmao = calcularProximaData({
        modo: irmao.modoAgendamento,
        periodicidadeMeses: irmao.periodicidadeMeses,
        diaFixo: irmao.diaFixo,
        mesFixo: irmao.mesFixo,
        dataExecucao,
      });
      await prisma.planoInstancia.update({
        where: { id: irmao.id },
        data: { proximaData: nextIrmao, dataPrevistaOriginal: nextIrmao },
      });
      if (nextIrmao) {
        const atualizado = await prisma.planoInstancia.findUnique({ where: { id: irmao.id } });
        if (atualizado) await ensureOcorrenciaAberta(prisma, atualizado, dataExecucao);
      }
    }
    return { avanco: true, proximaData: next };
  }

  await prisma.planoInstancia.update({
    where: { id: plano.id },
    data: {
      proximaData: next,
      dataPrevistaOriginal: next,
    },
  });
  if (next) {
    const atualizado = await prisma.planoInstancia.findUnique({ where: { id: plano.id } });
    if (atualizado) await ensureOcorrenciaAberta(prisma, atualizado, dataExecucao);
  }
  return { avanco: true, proximaData: next };
}

export async function registrarExecucaoPlano(opts: {
  prisma: PrismaPlanos;
  estabelecimentoId: string;
  equipamentoId: string;
  tipoOs: string;
  resultado?: ResultadoLaudo | string | null;
  dataExecucao: Date;
  osId?: string | null;
  osNumero?: number | null;
  laudoId?: string | null;
  checklist?: unknown;
  executorNome?: string | null;
  executorId?: string | null;
  fornecedorId?: string | null;
  usuarioId?: string | null;
}): Promise<{ ocorrenciaId?: string; avancou: boolean; motivo?: string } | null> {
  if (!tipoOsCumprePlano(opts.tipoOs)) {
    return { avancou: false, motivo: "corretiva_nao_cumpre" };
  }

  const tipoAtividade = opts.tipoOs as TipoAtividadePlano;
  const plano = await opts.prisma.planoInstancia.findFirst({
    where: {
      estabelecimentoId: opts.estabelecimentoId,
      equipamentoId: opts.equipamentoId,
      tipo: tipoAtividade,
      status: { not: StatusPlanoInstancia.DESATIVADO },
    },
  });
  if (!plano) return null;

  let oc = opts.osId
    ? await opts.prisma.planoOcorrencia.findFirst({
        where: { osId: opts.osId, planoInstanciaId: plano.id },
      })
    : null;
  if (!oc && opts.osNumero) {
    const os = await opts.prisma.ordemServico.findFirst({
      where: {
        estabelecimentoId: opts.estabelecimentoId,
        numero: opts.osNumero,
        equipamentoId: opts.equipamentoId,
      },
      select: { id: true },
    });
    if (os) {
      oc = await opts.prisma.planoOcorrencia.findFirst({
        where: { osId: os.id, planoInstanciaId: plano.id },
      });
    }
  }
  if (!oc) {
    oc = await ensureOcorrenciaAberta(opts.prisma, plano, opts.dataExecucao);
  }
  if (!oc) return { avancou: false, motivo: "sem_ocorrencia" };
  if (oc.cumpriuPlano) {
    return { ocorrenciaId: oc.id, avancou: false, motivo: "ja_cumprida" };
  }

  const cumpriu = resultadoLiberaProximaData(opts.resultado ?? null);
  const atraso = calcularAtrasoDias(oc.dataPrevistaOriginal, opts.dataExecucao, opts.dataExecucao);

  await opts.prisma.planoOcorrencia.update({
    where: { id: oc.id },
    data: {
      executadaEm: opts.dataExecucao,
      executorNome: opts.executorNome ?? oc.executorNome,
      executorId: opts.executorId ?? oc.executorId,
      fornecedorExecId: opts.fornecedorId ?? oc.fornecedorExecId,
      resultado: (opts.resultado as ResultadoLaudo | undefined) ?? oc.resultado,
      laudoId: opts.laudoId ?? oc.laudoId,
      checklist: (opts.checklist as object[]) ?? undefined,
      cumpriuPlano: cumpriu,
      atrasoDias: atraso,
      status: cumpriu ? StatusOcorrenciaPlano.EXECUTADA : StatusOcorrenciaPlano.VENCIDA,
      osId: opts.osId ?? oc.osId,
    },
  });

  await historico(
    opts.prisma,
    plano.id,
    cumpriu ? "EXECUTADA_APROVADA" : "EXECUTADA_NAO_LIBERA",
    `resultado=${opts.resultado ?? "sem_resultado"} · atraso=${atraso}d`,
    opts.usuarioId,
  );

  if (!cumpriu) {
    return { ocorrenciaId: oc.id, avancou: false, motivo: "reprovado_nao_libera" };
  }

  const avanco = await avancarSeGrupoPermitir(opts.prisma, plano, opts.dataExecucao, opts.usuarioId);
  return {
    ocorrenciaId: oc.id,
    avancou: avanco.avanco,
    motivo: avanco.avanco ? undefined : avanco.motivo,
  };
}

export async function reprogramarOcorrencia(
  prisma: PrismaPlanos,
  ocorrenciaId: string,
  novaData: Date,
  motivo: string,
  usuarioId?: string | null,
  agora = new Date(),
) {
  const oc = await prisma.planoOcorrencia.findUnique({
    where: { id: ocorrenciaId },
    include: { plano: true },
  });
  if (!oc) throw new Error("Ocorrência não encontrada");
  if (oc.cumpriuPlano) throw new Error("Não é possível reprogramar ocorrência já cumprida");

  const applied = aplicarReprogramacao({
    dataPrevistaOriginal: oc.dataPrevistaOriginal,
    novaData,
    motivo,
    agora,
  });

  const status = classificarAgenda(applied.dataPrevista, oc.plano.antecedenciaDias, agora, {
    osId: oc.osId,
    executada: Boolean(oc.executadaEm),
    cumpriu: false,
  });

  const updated = await prisma.planoOcorrencia.update({
    where: { id: oc.id },
    data: {
      dataPrevista: applied.dataPrevista,
      dataPrevistaOriginal: applied.dataPrevistaOriginal,
      atrasoDias: applied.atrasoDias,
      motivoReprogramacao: applied.motivo,
      reprogramadaEm: agora,
      reprogramadaPorId: usuarioId ?? null,
      status,
    },
  });

  await prisma.planoInstancia.update({
    where: { id: oc.planoInstanciaId },
    data: {
      proximaData: applied.dataPrevista,
      dataPrevistaOriginal: applied.dataPrevistaOriginal,
    },
  });

  await historico(
    prisma,
    oc.planoInstanciaId,
    "REPROGRAMADA",
    `${applied.dataPrevistaOriginal.toISOString().slice(0, 10)} → ${applied.dataPrevista.toISOString().slice(0, 10)} · atraso ${applied.atrasoDias}d · ${applied.motivo}`,
    usuarioId,
  );

  return updated;
}

export async function sincronizarInstanciasCatalogo(
  prisma: PrismaPlanos,
  estabelecimentoId: string,
  opts: { equipamentoId?: string; usuarioId?: string | null } = {},
) {
  const eqs = await prisma.equipamento.findMany({
    where: {
      estabelecimentoId,
      ...(opts.equipamentoId ? { id: opts.equipamentoId } : {}),
      tipoEquipamentoPlanoId: { not: null },
      situacao: { notIn: ["ARQUIVADO"] },
    },
    include: {
      tipoEquipamentoPlano: {
        include: { testes: { where: { ativo: true } } },
      },
    },
  });

  let criadas = 0;
  let atualizadas = 0;
  let ocorrencias = 0;

  for (const eq of eqs) {
    const testes = eq.tipoEquipamentoPlano?.testes ?? [];
    for (const teste of testes) {
      if (!teste.periodicidadeMeses || teste.periodicidadeMeses < 1) continue;
      const tipo = teste.tipoTeste as unknown as TipoAtividadePlano;
      const chave = chaveUnicaPlano(tipo);
      const existente = await prisma.planoInstancia.findUnique({
        where: { equipamentoId_chaveUnica: { equipamentoId: eq.id, chaveUnica: chave } },
      });

      const ultimoLaudo = await prisma.laudo.findFirst({
        where: {
          equipamentoId: eq.id,
          tipo: teste.tipoTeste as never,
          resultado: { in: [ResultadoLaudo.APROVADO, ResultadoLaudo.APROVADO_COM_RESSALVAS] },
        },
        orderBy: { dataExecucao: "desc" },
        select: { dataExecucao: true },
      });
      const proximaDoLaudo = ultimoLaudo
        ? calcularProximaData({
            modo: "INTERVALO_EXECUCAO",
            periodicidadeMeses: teste.periodicidadeMeses,
            dataExecucao: ultimoLaudo.dataExecucao,
          })
        : null;

      if (!existente) {
        const created = await prisma.planoInstancia.create({
          data: {
            estabelecimentoId,
            equipamentoId: eq.id,
            tipo,
            chaveUnica: chave,
            planoTesteId: teste.id,
            procedimentoCodigo: teste.procedimentoCodigo,
            periodicidadeMeses: teste.periodicidadeMeses,
            fontePeriodicidade: "PROCEDIMENTO",
            origemCatalogo: true,
            proximaData: proximaDoLaudo,
            dataPrevistaOriginal: proximaDoLaudo,
          },
        });
        criadas += 1;
        await historico(prisma, created.id, "CRIADO_CATALOGO", teste.procedimentoCodigo, opts.usuarioId);
        if (created.proximaData) {
          await ensureOcorrenciaAberta(prisma, created);
          ocorrencias += 1;
        }
        continue;
      }

      if (existente.editadoManualmente) {
        atualizadas += 0;
        if (existente.proximaData) {
          await ensureOcorrenciaAberta(prisma, existente);
        }
        continue;
      }

      const updated = await prisma.planoInstancia.update({
        where: { id: existente.id },
        data: {
          planoTesteId: teste.id,
          procedimentoCodigo: teste.procedimentoCodigo,
          periodicidadeMeses: existente.periodicidadeMeses ?? teste.periodicidadeMeses,
          fontePeriodicidade: existente.fontePeriodicidade ?? "PROCEDIMENTO",
          origemCatalogo: true,
          proximaData: existente.proximaData ?? proximaDoLaudo,
          dataPrevistaOriginal: existente.dataPrevistaOriginal ?? proximaDoLaudo,
        },
      });
      atualizadas += 1;
      if (updated.proximaData) {
        await ensureOcorrenciaAberta(prisma, updated);
        ocorrencias += 1;
      }
    }
  }

  return { equipamentos: eqs.length, criadas, atualizadas, ocorrencias };
}

export { chaveUnicaPlano };
