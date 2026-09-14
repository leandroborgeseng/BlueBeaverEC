import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CategoriaDocumentoControlado,
  CondicaoUsoEquipamento,
  OrigemDocumentoControlado,
  Prisma,
  StatusAlertaCampo,
  StatusDocumentoControlado,
  StatusOcorrenciaSeguranca,
  TipoAlertaCampo,
  TipoOcorrenciaSeguranca,
  TipoTreinamentoQualidade,
  TipoVinculoDocumento,
} from "@prisma/client";
import {
  PERMISSAO_NIVEL,
  alertaPermiteNotificacaoAutomatica,
  aplicarCondicaoUsoAutomaticamente,
  efeitoPublicarVersao,
  inferirCausalidade,
  manualFabricanteNaoEProcedimento,
  ocorrenciaESensivel,
  payloadContemDadoPaciente,
  periodoBuscaValido,
  podeConcluirOcorrencia,
  podeEditarModulo,
  temPermissao,
  transicaoStatusDocumento,
  transicaoStatusOcorrencia,
} from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

const MAX_ARQUIVO = 5_000_000;
const MIMES_OK = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);

const arquivoMeta = { select: { id: true, nomeArquivo: true, mimeType: true, tamanhoBytes: true, createdAt: true } };
const colabMeta = { select: { id: true, nome: true, matricula: true } };
const userMeta = { select: { id: true, nome: true, email: true } };
const eqMeta = { select: { id: true, tag: true, nome: true } };

function parseDataUrl(dataUrl: string, nomeArquivo?: string) {
  const raw = dataUrl?.trim() ?? "";
  const m = /^data:([^;]+);base64,(.+)$/i.exec(raw);
  if (!m) throw new BadRequestException("Anexo inválido (use data URL base64)");
  const mimeType = m[1].toLowerCase();
  if (!MIMES_OK.has(mimeType)) throw new BadRequestException("Anexo deve ser imagem ou PDF");
  const buffer = Buffer.from(m[2], "base64");
  if (!buffer.length) throw new BadRequestException("Anexo vazio");
  if (buffer.length > MAX_ARQUIVO) throw new BadRequestException("Anexo maior que 5 MB");
  const ext = mimeType === "application/pdf" ? "pdf" : mimeType.split("/")[1] ?? "bin";
  return {
    mimeType,
    buffer,
    nomeArquivo: (nomeArquivo?.trim() || `anexo.${ext}`).slice(0, 180),
  };
}

function dataIso(v?: string | null) {
  if (!v?.trim()) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadRequestException("Data inválida");
  return d;
}

function recusar(body: unknown) {
  const campo = payloadContemDadoPaciente((body ?? {}) as Record<string, unknown>);
  if (campo) {
    throw new BadRequestException(`Campo recusado: este módulo não registra dados de paciente (${campo}).`);
  }
}

@Injectable()
export class QualidadeService {
  constructor(private readonly prisma: PrismaService) {}

  private exigeEdicao(user: AuthUser) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "auditorias")) {
      throw new ForbiddenException("Sem permissão de edição");
    }
  }

  private podeVerSensivel(user: AuthUser) {
    return temPermissao(user.permissoesModulos, "auditorias", PERMISSAO_NIVEL.EDICAO_APROVACAO);
  }

  private async nextCodigo(estabelecimentoId: string, chave: string) {
    const row = await this.prisma.contadorSequencia.upsert({
      where: { estabelecimentoId_chave: { estabelecimentoId, chave } },
      create: { estabelecimentoId, chave, valor: 1 },
      update: { valor: { increment: 1 } },
    });
    return `${chave}-${String(row.valor).padStart(3, "0")}`;
  }

  private async gravarArquivo(
    user: AuthUser,
    input?: { dataUrl?: string; nomeArquivo?: string; arquivoId?: string },
  ) {
    if (input?.arquivoId) {
      const existing = await this.prisma.arquivoQualidade.findFirst({
        where: { id: input.arquivoId, estabelecimentoId: user.estabelecimentoId },
      });
      if (!existing) throw new NotFoundException("Arquivo não encontrado neste estabelecimento");
      return existing.id;
    }
    if (!input?.dataUrl) return null;
    const parsed = parseDataUrl(input.dataUrl, input.nomeArquivo);
    const created = await this.prisma.arquivoQualidade.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        nomeArquivo: parsed.nomeArquivo,
        mimeType: parsed.mimeType,
        conteudo: parsed.buffer,
        tamanhoBytes: parsed.buffer.length,
        createdById: user.userId,
      },
    });
    return created.id;
  }

  async resumo(user: AuthUser) {
    const est = user.estabelecimentoId;
    const [vigentes, treinamentos, abertas, alertasAbertos] = await Promise.all([
      this.prisma.documentoVersao.count({
        where: { status: "VIGENTE", documento: { estabelecimentoId: est } },
      }),
      this.prisma.treinamento.count({ where: { estabelecimentoId: est } }),
      this.prisma.ocorrenciaSeguranca.count({
        where: { estabelecimentoId: est, status: { not: "CONCLUIDA" } },
      }),
      this.prisma.alertaCampo.count({
        where: { estabelecimentoId: est, status: { not: "CONCLUIDO" } },
      }),
    ]);
    return { vigentes, treinamentos, ocorrenciasAbertas: abertas, alertasAbertos };
  }

  listPops(user: AuthUser) {
    return this.prisma.pop.findMany({
      where: { estabelecimentoId: user.estabelecimentoId },
      select: { id: true, codigo: true, titulo: true, versao: true, status: true, categoria: true },
      orderBy: { codigo: "asc" },
    });
  }

  async busca(
    user: AuthUser,
    q: {
      q?: string;
      tipo?: string;
      setorId?: string;
      equipamentoId?: string;
      de?: string;
      ate?: string;
    },
  ) {
    const periodo = periodoBuscaValido(q.de, q.ate);
    if (!periodo.ok) throw new BadRequestException(periodo.motivo);
    const est = user.estabelecimentoId;
    const term = q.q?.trim();
    const de = q.de ? new Date(q.de) : undefined;
    const ate = q.ate ? new Date(`${q.ate}T23:59:59.999Z`) : undefined;
    const tipo = q.tipo?.trim();
    const verSensivel = this.podeVerSensivel(user);

    const docsWhere: Prisma.DocumentoControladoWhereInput = {
      estabelecimentoId: est,
      ...(term
        ? {
            OR: [
              { codigo: { contains: term, mode: "insensitive" } },
              { titulo: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(q.setorId || q.equipamentoId
        ? {
            vinculos: {
              some: {
                ...(q.setorId ? { setorId: q.setorId } : {}),
                ...(q.equipamentoId ? { equipamentoId: q.equipamentoId } : {}),
              },
            },
          }
        : {}),
    };

    const treinoWhere: Prisma.TreinamentoWhereInput = {
      estabelecimentoId: est,
      ...(term
        ? {
            OR: [
              { codigo: { contains: term, mode: "insensitive" } },
              { tema: { contains: term, mode: "insensitive" } },
              { instrutorNome: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(q.equipamentoId ? { equipamentos: { some: { equipamentoId: q.equipamentoId } } } : {}),
      ...(de || ate ? { data: { gte: de, lte: ate } } : {}),
    };

    const ocWhere: Prisma.OcorrenciaSegurancaWhereInput = {
      estabelecimentoId: est,
      ...(tipo && ["FALHA", "INCIDENTE", "SUSPEITA_EVENTO_ADVERSO"].includes(tipo)
        ? { tipo: tipo as TipoOcorrenciaSeguranca }
        : {}),
      ...(q.setorId ? { setorId: q.setorId } : {}),
      ...(q.equipamentoId ? { equipamentoId: q.equipamentoId } : {}),
      ...(de || ate ? { dataOcorrido: { gte: de, lte: ate } } : {}),
      ...(term
        ? {
            OR: [
              { codigo: { contains: term, mode: "insensitive" } },
              { descricao: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(verSensivel ? {} : { AND: [{ acessoSensivel: false }, { tipo: { not: "SUSPEITA_EVENTO_ADVERSO" } }] }),
    };

    const alertaWhere: Prisma.AlertaCampoWhereInput = {
      estabelecimentoId: est,
      ...(tipo && ["ALERTA_FABRICANTE", "RECOLHIMENTO", "ACAO_DE_CAMPO"].includes(tipo)
        ? { tipo: tipo as TipoAlertaCampo }
        : {}),
      ...(q.equipamentoId ? { equipamentos: { some: { equipamentoId: q.equipamentoId } } } : {}),
      ...(de || ate ? { dataRegistro: { gte: de, lte: ate } } : {}),
      ...(term
        ? {
            OR: [
              { codigo: { contains: term, mode: "insensitive" } },
              { titulo: { contains: term, mode: "insensitive" } },
              { origem: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const incluirDocs = !tipo || tipo === "DOCUMENTO" || ["PROCEDIMENTO", "INSTRUCAO", "INSTITUCIONAL"].includes(tipo);
    const incluirTreino = !tipo || tipo === "TREINAMENTO";
    const incluirOc =
      !tipo ||
      tipo === "OCORRENCIA" ||
      ["FALHA", "INCIDENTE", "SUSPEITA_EVENTO_ADVERSO"].includes(tipo);
    const incluirAlerta =
      !tipo || tipo === "ALERTA" || ["ALERTA_FABRICANTE", "RECOLHIMENTO", "ACAO_DE_CAMPO"].includes(tipo);

    const [documentos, treinamentos, ocorrencias, alertas] = await Promise.all([
      incluirDocs
        ? this.prisma.documentoControlado.findMany({
            where: docsWhere,
            include: {
              versoes: { orderBy: { createdAt: "desc" }, take: 8 },
              vinculos: { include: { equipamento: eqMeta, setor: { select: { nome: true } } } },
              pop: { select: { codigo: true, titulo: true } },
            },
            take: 40,
            orderBy: { updatedAt: "desc" },
          })
        : [],
      incluirTreino
        ? this.prisma.treinamento.findMany({
            where: treinoWhere,
            include: {
              equipamentos: { include: { equipamento: eqMeta } },
              participantes: { include: { colaborador: colabMeta } },
              createdBy: userMeta,
            },
            take: 40,
            orderBy: { data: "desc" },
          })
        : [],
      incluirOc
        ? this.prisma.ocorrenciaSeguranca.findMany({
            where: ocWhere,
            include: {
              equipamento: eqMeta,
              setor: { select: { id: true, nome: true } },
              createdBy: userMeta,
            },
            take: 40,
            orderBy: { dataOcorrido: "desc" },
          })
        : [],
      incluirAlerta
        ? this.prisma.alertaCampo.findMany({
            where: alertaWhere,
            include: {
              equipamentos: { include: { equipamento: eqMeta } },
              createdBy: userMeta,
            },
            take: 40,
            orderBy: { dataRegistro: "desc" },
          })
        : [],
    ]);

    return { documentos, treinamentos, ocorrencias, alertas };
  }

  async exportar(
    user: AuthUser,
    q: {
      q?: string;
      tipo?: string;
      setorId?: string;
      equipamentoId?: string;
      de?: string;
      ate?: string;
    },
  ) {
    this.exigeEdicao(user);
    const dados = await this.busca(user, q);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = user.email;
    wb.created = new Date();
    const meta = wb.addWorksheet("Autoria");
    meta.addRows([
      ["Exportado por", user.email],
      ["Perfil", user.perfil],
      ["Estabelecimento", user.estabelecimentoId],
      ["Gerado em", new Date().toISOString()],
      ["Filtros", JSON.stringify(q)],
      [
        "Aviso",
        "Registro operacional interno. Não constitui declaração de conformidade regulatória.",
      ],
    ]);

    const docs = wb.addWorksheet("Documentos");
    docs.addRow(["codigo", "titulo", "categoria", "origem", "versaoVigente", "status", "atualizadoEm"]);
    for (const d of dados.documentos) {
      const vig = d.versoes.find((v) => v.status === "VIGENTE") ?? d.versoes[0];
      docs.addRow([d.codigo, d.titulo, d.categoria, d.origem, vig?.versao ?? "", vig?.status ?? "", d.updatedAt]);
    }

    const tre = wb.addWorksheet("Treinamentos");
    tre.addRow(["codigo", "tema", "tipo", "data", "instrutor", "presentes", "autor", "criadoEm"]);
    for (const t of dados.treinamentos) {
      tre.addRow([
        t.codigo,
        t.tema,
        t.tipo,
        t.data,
        t.instrutorNome,
        t.participantes.filter((p) => p.presente).length,
        t.createdBy?.email ?? "",
        t.createdAt,
      ]);
    }

    const oc = wb.addWorksheet("Ocorrencias");
    oc.addRow(["codigo", "tipo", "status", "data", "equipamento", "setor", "autor", "criadoEm"]);
    for (const o of dados.ocorrencias) {
      oc.addRow([
        o.codigo,
        o.tipo,
        o.status,
        o.dataOcorrido,
        o.equipamento?.tag ?? "",
        o.setor?.nome ?? "",
        o.createdBy?.email ?? "",
        o.createdAt,
      ]);
    }

    const al = wb.addWorksheet("Alertas");
    al.addRow(["codigo", "tipo", "status", "titulo", "origem", "prazo", "autor", "criadoEm"]);
    for (const a of dados.alertas) {
      al.addRow([a.codigo, a.tipo, a.status, a.titulo, a.origem, a.prazo, a.createdBy?.email ?? "", a.createdAt]);
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    return { buffer, filename: `qualidade-${new Date().toISOString().slice(0, 10)}.xlsx` };
  }

  listDocumentos(user: AuthUser) {
    return this.prisma.documentoControlado.findMany({
      where: { estabelecimentoId: user.estabelecimentoId },
      include: {
        versoes: { orderBy: { createdAt: "desc" } },
        vinculos: {
          include: {
            equipamento: eqMeta,
            modelo: { select: { id: true, nome: true } },
            setor: { select: { id: true, nome: true } },
          },
        },
        pop: { select: { id: true, codigo: true, titulo: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getDocumento(user: AuthUser, id: string) {
    const doc = await this.prisma.documentoControlado.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
      include: {
        versoes: {
          orderBy: { createdAt: "desc" },
          include: {
            arquivo: arquivoMeta,
            responsavel: colabMeta,
            createdBy: userMeta,
            publicadoPor: userMeta,
          },
        },
        vinculos: {
          include: {
            equipamento: eqMeta,
            modelo: { select: { id: true, nome: true } },
            setor: { select: { id: true, nome: true } },
          },
        },
        pop: { select: { id: true, codigo: true, titulo: true, versao: true } },
      },
    });
    if (!doc) throw new NotFoundException("Documento não encontrado");
    return doc;
  }

  async createDocumento(
    user: AuthUser,
    body: {
      titulo: string;
      categoria: CategoriaDocumentoControlado;
      popId?: string;
      origemDocumentoEquipamentoTipo?: string;
      versao?: string;
      responsavelId?: string;
      dataRevisao?: string;
      proximaRevisao?: string;
      observacao?: string;
      dataUrl?: string;
      nomeArquivo?: string;
      arquivoId?: string;
    },
  ) {
    this.exigeEdicao(user);
    recusar(body);
    if (manualFabricanteNaoEProcedimento(body.origemDocumentoEquipamentoTipo)) {
      throw new BadRequestException(
        "Manual, garantia ou nota fiscal do fabricante não são procedimento institucional. Vincule o equipamento ao documento, sem reclassificar o arquivo.",
      );
    }
    let origem: OrigemDocumentoControlado = "INSTITUCIONAL";
    let popId: string | undefined;
    if (body.popId) {
      const pop = await this.prisma.pop.findFirst({
        where: { id: body.popId, estabelecimentoId: user.estabelecimentoId },
      });
      if (!pop) throw new NotFoundException("POP não encontrado neste estabelecimento");
      origem = "BIBLIOTECA_POP";
      popId = pop.id;
    }
    const codigo = await this.nextCodigo(user.estabelecimentoId, "DOC");
    const arquivoId = await this.gravarArquivo(user, body);
    return this.prisma.documentoControlado.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        codigo,
        titulo: body.titulo.trim(),
        categoria: body.categoria,
        origem,
        popId,
        versoes: {
          create: {
            versao: body.versao?.trim() || "1.0",
            status: "RASCUNHO",
            responsavelId: body.responsavelId,
            dataRevisao: dataIso(body.dataRevisao),
            proximaRevisao: dataIso(body.proximaRevisao),
            observacao: body.observacao?.trim() || null,
            arquivoId,
            createdById: user.userId,
          },
        },
      },
      include: { versoes: true, pop: { select: { codigo: true, titulo: true } } },
    });
  }

  async addVersao(
    user: AuthUser,
    id: string,
    body: {
      versao: string;
      responsavelId?: string;
      dataRevisao?: string;
      proximaRevisao?: string;
      observacao?: string;
      dataUrl?: string;
      nomeArquivo?: string;
      arquivoId?: string;
    },
  ) {
    this.exigeEdicao(user);
    recusar(body);
    const doc = await this.getDocumento(user, id);
    const arquivoId = await this.gravarArquivo(user, body);
    return this.prisma.documentoVersao.create({
      data: {
        documentoId: doc.id,
        versao: body.versao.trim(),
        status: "RASCUNHO",
        responsavelId: body.responsavelId,
        dataRevisao: dataIso(body.dataRevisao),
        proximaRevisao: dataIso(body.proximaRevisao),
        observacao: body.observacao?.trim() || null,
        arquivoId,
        createdById: user.userId,
      },
    });
  }

  async publicarVersao(user: AuthUser, id: string, versaoId: string) {
    this.exigeEdicao(user);
    const doc = await this.getDocumento(user, id);
    const alvo = doc.versoes.find((v) => v.id === versaoId);
    if (!alvo) throw new NotFoundException("Versão não encontrada");
    const trans = transicaoStatusDocumento(alvo.status, "VIGENTE");
    if (!trans.ok) throw new BadRequestException(trans.motivo);
    const vigente = doc.versoes.find((v) => v.status === "VIGENTE");
    const efeito = efeitoPublicarVersao(vigente?.id ?? null, alvo.id);
    await this.prisma.$transaction([
      ...(efeito.obsoletarId
        ? [
            this.prisma.documentoVersao.update({
              where: { id: efeito.obsoletarId },
              data: { status: StatusDocumentoControlado.OBSOLETO },
            }),
          ]
        : []),
      this.prisma.documentoVersao.update({
        where: { id: alvo.id },
        data: {
          status: StatusDocumentoControlado.VIGENTE,
          dataVigencia: new Date(),
          publicadoEm: new Date(),
          publicadoPorId: user.userId,
        },
      }),
    ]);
    return this.getDocumento(user, id);
  }

  async obsoletarVersao(user: AuthUser, id: string, versaoId: string) {
    this.exigeEdicao(user);
    const doc = await this.getDocumento(user, id);
    const alvo = doc.versoes.find((v) => v.id === versaoId);
    if (!alvo) throw new NotFoundException("Versão não encontrada");
    const trans = transicaoStatusDocumento(alvo.status, "OBSOLETO");
    if (!trans.ok) throw new BadRequestException(trans.motivo);
    await this.prisma.documentoVersao.update({
      where: { id: alvo.id },
      data: { status: StatusDocumentoControlado.OBSOLETO },
    });
    return this.getDocumento(user, id);
  }

  async addVinculo(
    user: AuthUser,
    id: string,
    body: {
      tipo: TipoVinculoDocumento;
      equipamentoId?: string;
      modeloId?: string;
      setorId?: string;
      tipoIntervencao?: string;
    },
  ) {
    this.exigeEdicao(user);
    const doc = await this.getDocumento(user, id);
    if (body.tipo === "EQUIPAMENTO") {
      if (!body.equipamentoId) throw new BadRequestException("Informe o equipamento");
      const eq = await this.prisma.equipamento.findFirst({
        where: { id: body.equipamentoId, estabelecimentoId: user.estabelecimentoId },
      });
      if (!eq) throw new NotFoundException("Equipamento não encontrado");
    }
    if (body.tipo === "SETOR") {
      if (!body.setorId) throw new BadRequestException("Informe o setor");
      const setor = await this.prisma.setor.findFirst({
        where: { id: body.setorId, estabelecimentoId: user.estabelecimentoId },
      });
      if (!setor) throw new NotFoundException("Setor não encontrado");
    }
    if (body.tipo === "MODELO" && !body.modeloId) throw new BadRequestException("Informe o modelo");
    if (body.tipo === "INTERVENCAO" && !body.tipoIntervencao?.trim()) {
      throw new BadRequestException("Informe o tipo de intervenção");
    }
    return this.prisma.documentoVinculo.create({
      data: {
        documentoId: doc.id,
        tipo: body.tipo,
        equipamentoId: body.tipo === "EQUIPAMENTO" ? body.equipamentoId : null,
        modeloId: body.tipo === "MODELO" ? body.modeloId : null,
        setorId: body.tipo === "SETOR" ? body.setorId : null,
        tipoIntervencao: body.tipo === "INTERVENCAO" ? body.tipoIntervencao?.trim() : null,
      },
    });
  }

  async removeVinculo(user: AuthUser, id: string, vinculoId: string) {
    this.exigeEdicao(user);
    const doc = await this.getDocumento(user, id);
    const v = doc.vinculos.find((x) => x.id === vinculoId);
    if (!v) throw new NotFoundException("Vínculo não encontrado");
    await this.prisma.documentoVinculo.delete({ where: { id: v.id } });
    return { ok: true };
  }

  async baixarArquivo(user: AuthUser, arquivoId: string) {
    const arq = await this.prisma.arquivoQualidade.findFirst({
      where: { id: arquivoId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!arq) throw new NotFoundException("Arquivo não encontrado");
    return arq;
  }

  listTreinamentos(user: AuthUser) {
    return this.prisma.treinamento.findMany({
      where: { estabelecimentoId: user.estabelecimentoId },
      include: {
        equipamentos: { include: { equipamento: eqMeta } },
        participantes: { include: { colaborador: colabMeta } },
        evidencias: { include: { arquivo: arquivoMeta } },
        documento: { select: { id: true, codigo: true, titulo: true } },
        pop: { select: { id: true, codigo: true, titulo: true } },
        createdBy: userMeta,
      },
      orderBy: { data: "desc" },
    });
  }

  async getTreinamento(user: AuthUser, id: string) {
    const t = await this.prisma.treinamento.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
      include: {
        equipamentos: { include: { equipamento: eqMeta } },
        participantes: { include: { colaborador: colabMeta } },
        evidencias: { include: { arquivo: arquivoMeta } },
        documento: { select: { id: true, codigo: true, titulo: true } },
        pop: { select: { id: true, codigo: true, titulo: true } },
        arquivo: arquivoMeta,
        instrutor: colabMeta,
        createdBy: userMeta,
      },
    });
    if (!t) throw new NotFoundException("Treinamento não encontrado");
    return { ...t, presencaConfereCompetencia: false };
  }

  async createTreinamento(
    user: AuthUser,
    body: {
      tema: string;
      tipo?: TipoTreinamentoQualidade;
      instrutorNome: string;
      instrutorId?: string;
      data: string;
      publico?: string;
      documentoId?: string;
      popId?: string;
      arquivoId?: string;
      dataUrl?: string;
      nomeArquivo?: string;
      observacao?: string;
      equipamentoIds?: string[];
      colaboradorIds?: string[];
    },
  ) {
    this.exigeEdicao(user);
    recusar(body);
    if (body.documentoId && body.popId) {
      throw new BadRequestException("Vincule o material ao documento controlado ou ao POP — não duplique o arquivo.");
    }
    if (body.documentoId) {
      await this.getDocumento(user, body.documentoId);
    }
    if (body.popId) {
      const pop = await this.prisma.pop.findFirst({
        where: { id: body.popId, estabelecimentoId: user.estabelecimentoId },
      });
      if (!pop) throw new NotFoundException("POP não encontrado");
    }
    const arquivoId = await this.gravarArquivo(user, body);
    const codigo = await this.nextCodigo(user.estabelecimentoId, "TRN");
    return this.prisma.treinamento.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        codigo,
        tema: body.tema.trim(),
        tipo: body.tipo ?? "INICIAL",
        instrutorNome: body.instrutorNome.trim(),
        instrutorId: body.instrutorId,
        data: dataIso(body.data) ?? new Date(),
        publico: body.publico?.trim() || null,
        documentoId: body.documentoId,
        popId: body.popId,
        arquivoId,
        observacao: body.observacao?.trim() || null,
        createdById: user.userId,
        equipamentos: body.equipamentoIds?.length
          ? { create: body.equipamentoIds.map((equipamentoId) => ({ equipamentoId })) }
          : undefined,
        participantes: body.colaboradorIds?.length
          ? { create: body.colaboradorIds.map((colaboradorId) => ({ colaboradorId })) }
          : undefined,
      },
      include: {
        participantes: { include: { colaborador: colabMeta } },
        equipamentos: { include: { equipamento: eqMeta } },
      },
    });
  }

  async addParticipante(user: AuthUser, id: string, colaboradorId: string) {
    this.exigeEdicao(user);
    const t = await this.getTreinamento(user, id);
    const colab = await this.prisma.colaborador.findFirst({
      where: { id: colaboradorId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!colab) throw new NotFoundException("Colaborador não encontrado");
    return this.prisma.treinamentoParticipante.create({
      data: { treinamentoId: t.id, colaboradorId, presente: false },
    });
  }

  async marcarPresenca(user: AuthUser, id: string, participanteId: string, presente: boolean) {
    this.exigeEdicao(user);
    const t = await this.getTreinamento(user, id);
    const p = t.participantes.find((x) => x.id === participanteId);
    if (!p) throw new NotFoundException("Participante não encontrado");
    return this.prisma.treinamentoParticipante.update({
      where: { id: p.id },
      data: { presente },
    });
  }

  async addEvidenciaTreino(user: AuthUser, id: string, body: { dataUrl?: string; nomeArquivo?: string; arquivoId?: string }) {
    this.exigeEdicao(user);
    const t = await this.getTreinamento(user, id);
    const arquivoId = await this.gravarArquivo(user, body);
    if (!arquivoId) throw new BadRequestException("Envie o arquivo ou vincule um existente");
    return this.prisma.treinamentoEvidencia.create({
      data: { treinamentoId: t.id, arquivoId },
      include: { arquivo: arquivoMeta },
    });
  }

  async addEquipamentoTreino(user: AuthUser, id: string, equipamentoId: string) {
    this.exigeEdicao(user);
    const t = await this.getTreinamento(user, id);
    const eq = await this.prisma.equipamento.findFirst({
      where: { id: equipamentoId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!eq) throw new NotFoundException("Equipamento não encontrado");
    return this.prisma.treinamentoEquipamento.create({
      data: { treinamentoId: t.id, equipamentoId },
    });
  }

  async listOcorrencias(user: AuthUser) {
    const verSensivel = this.podeVerSensivel(user);
    return this.prisma.ocorrenciaSeguranca.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        ...(verSensivel ? {} : { AND: [{ acessoSensivel: false }, { tipo: { not: "SUSPEITA_EVENTO_ADVERSO" } }] }),
      },
      include: {
        equipamento: eqMeta,
        setor: { select: { id: true, nome: true } },
        responsavel: colabMeta,
        createdBy: userMeta,
        _count: { select: { investigacoes: true, acoes: true } },
      },
      orderBy: { dataOcorrido: "desc" },
    });
  }

  async getOcorrencia(user: AuthUser, id: string) {
    const oc = await this.prisma.ocorrenciaSeguranca.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
      include: {
        equipamento: { select: { id: true, tag: true, nome: true, condicaoUso: true } },
        setor: { select: { id: true, nome: true } },
        responsavel: colabMeta,
        ordemServico: { select: { id: true, numero: true, codigo: true, status: true } },
        documento: { select: { id: true, codigo: true, titulo: true } },
        investigacoes: { include: { createdBy: userMeta }, orderBy: { createdAt: "desc" } },
        acoes: { include: { arquivo: arquivoMeta, createdBy: userMeta }, orderBy: { createdAt: "desc" } },
        arquivos: { include: { arquivo: arquivoMeta } },
        createdBy: userMeta,
        concludedBy: userMeta,
      },
    });
    if (!oc) throw new NotFoundException("Ocorrência não encontrada");
    if (ocorrenciaESensivel(oc.tipo, oc.acessoSensivel) && !this.podeVerSensivel(user)) {
      throw new ForbiddenException("Acesso restrito a ocorrência sensível");
    }
    if (ocorrenciaESensivel(oc.tipo, oc.acessoSensivel)) {
      await this.prisma.logAcesso.create({
        data: {
          usuarioId: user.userId,
          acao: "ACESSO_OCORRENCIA_SENSIVEL",
          detalhe: `${user.estabelecimentoId} · ${oc.codigo}`,
        },
      });
    }
    return {
      ...oc,
      causalidadeInferida: inferirCausalidade(),
      condicaoUsoAutomatica: aplicarCondicaoUsoAutomaticamente(),
    };
  }

  async createOcorrencia(
    user: AuthUser,
    body: {
      tipo: TipoOcorrenciaSeguranca;
      equipamentoId?: string;
      setorId?: string;
      dataOcorrido: string;
      descricao: string;
      medidasImediatas?: string;
      responsavelId?: string;
      ordemServicoId?: string;
      documentoId?: string;
      acessoSensivel?: boolean;
      condicaoUsoSugerida?: string;
    },
  ) {
    this.exigeEdicao(user);
    recusar(body);
    if (body.equipamentoId) {
      const eq = await this.prisma.equipamento.findFirst({
        where: { id: body.equipamentoId, estabelecimentoId: user.estabelecimentoId },
      });
      if (!eq) throw new NotFoundException("Equipamento não encontrado");
    }
    if (body.setorId) {
      const setor = await this.prisma.setor.findFirst({
        where: { id: body.setorId, estabelecimentoId: user.estabelecimentoId },
      });
      if (!setor) throw new NotFoundException("Setor não encontrado");
    }
    if (body.ordemServicoId) {
      const os = await this.prisma.ordemServico.findFirst({
        where: { id: body.ordemServicoId, estabelecimentoId: user.estabelecimentoId },
      });
      if (!os) throw new NotFoundException("OS não encontrada");
    }
    const codigo = await this.nextCodigo(user.estabelecimentoId, "OCS");
    const acessoSensivel = ocorrenciaESensivel(body.tipo, body.acessoSensivel);
    return this.prisma.ocorrenciaSeguranca.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        codigo,
        tipo: body.tipo,
        equipamentoId: body.equipamentoId,
        setorId: body.setorId,
        dataOcorrido: dataIso(body.dataOcorrido) ?? new Date(),
        descricao: body.descricao.trim(),
        medidasImediatas: body.medidasImediatas?.trim() || null,
        responsavelId: body.responsavelId,
        ordemServicoId: body.ordemServicoId,
        documentoId: body.documentoId,
        acessoSensivel,
        condicaoUsoSugerida: body.condicaoUsoSugerida?.trim() || null,
        createdById: user.userId,
      },
    });
  }

  async addInvestigacao(user: AuthUser, id: string, body: { relato: string; hipotese?: string }) {
    this.exigeEdicao(user);
    recusar(body);
    const oc = await this.getOcorrencia(user, id);
    if (oc.status === "CONCLUIDA") throw new BadRequestException("Ocorrência já concluída");
    const created = await this.prisma.ocorrenciaInvestigacao.create({
      data: {
        ocorrenciaId: oc.id,
        relato: body.relato.trim(),
        hipotese: body.hipotese?.trim() || null,
        createdById: user.userId,
      },
    });
    if (oc.status === "ABERTA") {
      await this.prisma.ocorrenciaSeguranca.update({
        where: { id: oc.id },
        data: { status: StatusOcorrenciaSeguranca.EM_INVESTIGACAO },
      });
    }
    return created;
  }

  async addAcao(
    user: AuthUser,
    id: string,
    body: { descricao: string; responsavelNome?: string; prazo?: string; dataUrl?: string; nomeArquivo?: string; arquivoId?: string },
  ) {
    this.exigeEdicao(user);
    recusar(body);
    const oc = await this.getOcorrencia(user, id);
    if (oc.status === "CONCLUIDA") throw new BadRequestException("Ocorrência já concluída");
    const arquivoId = await this.gravarArquivo(user, body);
    const created = await this.prisma.ocorrenciaAcao.create({
      data: {
        ocorrenciaId: oc.id,
        descricao: body.descricao.trim(),
        responsavelNome: body.responsavelNome?.trim() || null,
        prazo: dataIso(body.prazo),
        arquivoId,
        createdById: user.userId,
      },
    });
    if (oc.status === "ABERTA" || oc.status === "EM_INVESTIGACAO") {
      await this.prisma.ocorrenciaSeguranca.update({
        where: { id: oc.id },
        data: { status: StatusOcorrenciaSeguranca.ACOES_EM_ANDAMENTO },
      });
    }
    return created;
  }

  async concluirAcao(user: AuthUser, id: string, acaoId: string) {
    this.exigeEdicao(user);
    const oc = await this.getOcorrencia(user, id);
    const acao = oc.acoes.find((a) => a.id === acaoId);
    if (!acao) throw new NotFoundException("Ação não encontrada");
    return this.prisma.ocorrenciaAcao.update({
      where: { id: acao.id },
      data: { concluidoEm: new Date() },
    });
  }

  async statusOcorrencia(user: AuthUser, id: string, status: StatusOcorrenciaSeguranca) {
    this.exigeEdicao(user);
    const oc = await this.getOcorrencia(user, id);
    const trans = transicaoStatusOcorrencia(oc.status, status);
    if (!trans.ok) throw new BadRequestException(trans.motivo);
    if (status === "CONCLUIDA") {
      const check = podeConcluirOcorrencia({
        medidasImediatas: oc.medidasImediatas,
        investigacoes: oc.investigacoes.length,
        acoes: oc.acoes.length,
        acoesAbertas: oc.acoes.filter((a) => !a.concluidoEm).length,
      });
      if (!check.ok) throw new BadRequestException(check.motivo);
    }
    return this.prisma.ocorrenciaSeguranca.update({
      where: { id: oc.id },
      data: {
        status,
        concludedAt: status === "CONCLUIDA" ? new Date() : oc.concludedAt,
        concludedById: status === "CONCLUIDA" ? user.userId : oc.concludedById,
      },
    });
  }

  async aplicarCondicaoUso(user: AuthUser, id: string, condicao: CondicaoUsoEquipamento) {
    if (!temPermissao(user.permissoesModulos, "equipamentos", PERMISSAO_NIVEL.EDICAO_APROVACAO)) {
      throw new ForbiddenException("Somente profissional autorizado altera a condição de uso");
    }
    const oc = await this.getOcorrencia(user, id);
    if (!oc.equipamentoId) throw new BadRequestException("Ocorrência sem equipamento vinculado");
    await this.prisma.$transaction([
      this.prisma.equipamento.update({
        where: { id: oc.equipamentoId },
        data: { condicaoUso: condicao },
      }),
      this.prisma.ocorrenciaSeguranca.update({
        where: { id: oc.id },
        data: { condicaoUsoAplicadaEm: new Date(), condicaoUsoAplicadaPorId: user.userId },
      }),
    ]);
    return this.getOcorrencia(user, id);
  }

  async vincularNc(user: AuthUser, id: string, naoConformidadeId: string) {
    this.exigeEdicao(user);
    const oc = await this.getOcorrencia(user, id);
    const nc = await this.prisma.naoConformidade.findFirst({
      where: { id: naoConformidadeId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!nc) throw new NotFoundException("NC não encontrada");
    return this.prisma.ocorrenciaSeguranca.update({
      where: { id: oc.id },
      data: { naoConformidadeId: nc.id },
    });
  }

  listAlertas(user: AuthUser) {
    return this.prisma.alertaCampo.findMany({
      where: { estabelecimentoId: user.estabelecimentoId },
      include: {
        equipamentos: { include: { equipamento: eqMeta } },
        arquivos: { include: { arquivo: arquivoMeta } },
        responsavel: colabMeta,
        createdBy: userMeta,
      },
      orderBy: { dataRegistro: "desc" },
    });
  }

  async getAlerta(user: AuthUser, id: string) {
    const a = await this.prisma.alertaCampo.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
      include: {
        equipamentos: { include: { equipamento: eqMeta } },
        arquivos: { include: { arquivo: arquivoMeta } },
        responsavel: colabMeta,
        createdBy: userMeta,
      },
    });
    if (!a) throw new NotFoundException("Alerta não encontrado");
    return { ...a, notificacaoAutomatica: alertaPermiteNotificacaoAutomatica() };
  }

  async createAlerta(
    user: AuthUser,
    body: {
      tipo: TipoAlertaCampo;
      titulo: string;
      origem: string;
      dataRegistro?: string;
      prazo?: string;
      responsavelId?: string;
      protocoloComunicacaoExterna?: string;
      observacao?: string;
      equipamentoIds?: string[];
    },
  ) {
    this.exigeEdicao(user);
    recusar(body);
    const codigo = await this.nextCodigo(user.estabelecimentoId, "ALC");
    return this.prisma.alertaCampo.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        codigo,
        tipo: body.tipo,
        titulo: body.titulo.trim(),
        origem: body.origem.trim(),
        dataRegistro: dataIso(body.dataRegistro) ?? new Date(),
        prazo: dataIso(body.prazo),
        responsavelId: body.responsavelId,
        protocoloComunicacaoExterna: body.protocoloComunicacaoExterna?.trim() || null,
        observacao: body.observacao?.trim() || null,
        createdById: user.userId,
        equipamentos: body.equipamentoIds?.length
          ? { create: body.equipamentoIds.map((equipamentoId) => ({ equipamentoId })) }
          : undefined,
      },
      include: { equipamentos: { include: { equipamento: eqMeta } } },
    });
  }

  async addEquipamentoAlerta(user: AuthUser, id: string, equipamentoId: string) {
    this.exigeEdicao(user);
    const a = await this.getAlerta(user, id);
    const eq = await this.prisma.equipamento.findFirst({
      where: { id: equipamentoId, estabelecimentoId: user.estabelecimentoId },
    });
    if (!eq) throw new NotFoundException("Equipamento não encontrado");
    return this.prisma.alertaCampoEquipamento.create({
      data: { alertaId: a.id, equipamentoId },
    });
  }

  async addEvidenciaAlerta(user: AuthUser, id: string, body: { dataUrl?: string; nomeArquivo?: string; arquivoId?: string }) {
    this.exigeEdicao(user);
    const a = await this.getAlerta(user, id);
    const arquivoId = await this.gravarArquivo(user, body);
    if (!arquivoId) throw new BadRequestException("Envie o arquivo ou vincule um existente");
    return this.prisma.alertaCampoArquivo.create({
      data: { alertaId: a.id, arquivoId },
      include: { arquivo: arquivoMeta },
    });
  }

  async statusAlerta(user: AuthUser, id: string, status: StatusAlertaCampo) {
    this.exigeEdicao(user);
    const a = await this.getAlerta(user, id);
    return this.prisma.alertaCampo.update({ where: { id: a.id }, data: { status } });
  }
}
