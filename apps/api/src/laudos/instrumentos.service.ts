import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { podeEditarModulo } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";
import { statusCertificadoNaData } from "./laudo-regras";
import {
  janelaAlerta,
  camposObrigatoriosFaltando,
  problemasCertificadoVigente,
  normalizarNSerie,
  preferencialCompativel,
  sugerirPadraoLaudo,
  validarCertificadoPadrao,
} from "./padrao-regras";
import { carregarAlertasPadroes } from "./padrao-alertas";

export type PontoInput = {
  ordem?: number;
  grandeza?: string;
  unidade: string;
  valorNominal?: number;
  valorConvencional?: number;
  indicacao?: number;
  correcao?: number;
  incertezaExpandida: number;
  fatorK?: number;
  probabilidadeAbrangencia?: number;
  observacao?: string;
};

export type CreateInstrumentoInput = {
  nome: string;
  nSerie: string;
  fabricante?: string;
  modelo?: string;
  codigoPatrimonio?: string;
  tipoAnalisador?: string;
  identificacaoExterna?: string;
  grandezas?: string[];
  faixaMedicao?: string;
  resolucao?: string;
  observacoes?: string;
  certificadoNumero?: string;
  certificadoEmissao?: string;
  certificadoValidade?: string;
  laboratorioEmissor?: string;
};

export type CreateCertificadoInput = {
  numero: string;
  dataEmissao: string;
  dataValidade: string;
  laboratorioEmissor?: string;
  laboratorioAcreditacao?: string;
  fatorAbrangencia?: number;
  probabilidadeAbrangencia?: number;
  observacoes?: string;
  vigente?: boolean;
  pontos?: PontoInput[];
  /** data URL base64: data:application/pdf;base64,... */
  anexoDataUrl?: string;
  anexoNome?: string;
};

/** Mapeia os pontos do DTO para gravação (k/probabilidade vazios ficam null: herança na leitura). */
function pontosParaCriar(pontos: PontoInput[]) {
  return pontos.map((p, idx) => ({
    ordem: p.ordem ?? idx + 1,
    grandeza: p.grandeza?.trim() || null,
    unidade: p.unidade.trim(),
    valorNominal: p.valorNominal ?? null,
    valorConvencional: p.valorConvencional ?? null,
    indicacao: p.indicacao ?? null,
    correcao:
      p.correcao ??
      (p.valorConvencional != null && p.indicacao != null
        ? Number((p.valorConvencional - p.indicacao).toFixed(6))
        : null),
    incertezaExpandida: Number(p.incertezaExpandida),
    // null = herda do certificado na leitura/cálculo (pontoComHeranca); sobrescrita explícita
    fatorK: p.fatorK ?? null,
    probabilidadeAbrangencia: p.probabilidadeAbrangencia ?? null,
    observacao: p.observacao?.trim() || null,
  }));
}

/** Certificados "atuais": vigentes e sem revisão posterior. */
export const CERT_ATUAL = { vigente: true, revisoes: { none: {} } } as const;

export const MSG_CERT_USADO = "Certificado usado em laudos emitidos; cadastre uma revisão";

/** Tudo que não é `observacoes` (dados metrológicos e de emissão), normalizado para comparação. */
export function assinaturaMetrologica(c: {
  numero: string; dataEmissao: Date | string; dataValidade: Date | string;
  laboratorioEmissor?: string | null; laboratorioAcreditacao?: string | null;
  fatorAbrangencia?: number | null; probabilidadeAbrangencia?: number | null;
  pontos: Array<Record<string, unknown>>;
}): string {
  const d = (v: Date | string) => new Date(v).toISOString();
  const n = (v: unknown) => (v == null ? null : v);
  return JSON.stringify({
    numero: c.numero, emissao: d(c.dataEmissao), validade: d(c.dataValidade),
    lab: n(c.laboratorioEmissor), rbc: n(c.laboratorioAcreditacao),
    k: n(c.fatorAbrangencia), p: n(c.probabilidadeAbrangencia),
    pontos: c.pontos.map((p) => [p.grandeza ?? null, p.unidade, n(p.valorNominal), n(p.valorConvencional), n(p.indicacao), n(p.correcao), Number(p.incertezaExpandida), n(p.fatorK), n(p.probabilidadeAbrangencia), p.observacao ?? null]),
  });
}

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!m) throw new BadRequestException("Anexo inválido (use data URL base64)");
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

function statusCert(validade: Date | null | undefined, diasAlerta = 60) {
  return statusCertificadoNaData(validade, new Date(), diasAlerta);
}

@Injectable()
export class InstrumentosService {
  constructor(private readonly prisma: PrismaService) {}

  /** Janela de alerta configurada no estabelecimento (Organização.diasAlertaCertificado, padrão 60). */
  async diasAlerta(estabelecimentoId: string): Promise<number> {
    const org = await this.prisma.estabelecimento
      .findUnique({ where: { id: estabelecimentoId }, select: { diasAlertaCertificado: true } })
      .catch(() => null);
    return janelaAlerta(org?.diasAlertaCertificado);
  }

  private async garantirNSerieLivre(estabelecimentoId: string, nSerie: string, ignorarId?: string) {
    const dup = await this.prisma.instrumentoPadrao.findFirst({
      where: { estabelecimentoId, nSerie: { equals: nSerie, mode: "insensitive" }, ...(ignorarId ? { NOT: { id: ignorarId } } : {}) },
      select: { id: true, nome: true, ativo: true },
    });
    if (dup) {
      throw new ConflictException(
        `Já existe um padrão com o nº de série ${nSerie} neste estabelecimento (${dup.nome}${dup.ativo ? "" : ", inativo"})`,
      );
    }
  }

  /** Alertas de certificados de padrão vencidos / a vencer / ausentes (crit. 3). */
  async alertas(estabelecimentoId: string, diasParam?: number) {
    return carregarAlertasPadroes(this.prisma, estabelecimentoId, diasParam);
  }

  /** Padrão sugerido para o laudo pelo tipo de analisador (crit. 4). */
  async sugestao(
    estabelecimentoId: string,
    tipo?: string,
    ctx: { tipoLaudo?: string; nomesEquipamento?: string[] } = {},
  ) {
    const [prefs, lista] = await Promise.all([
      this.prisma.padraoPreferencial.findMany({
        where: { estabelecimentoId },
        select: { tipo: true, instrumentoId: true },
      }),
      this.list(estabelecimentoId),
    ]);
    const s = sugerirPadraoLaudo({ tipo, ...ctx }, prefs, lista);
    return { tipo: tipo?.trim() || null, ...s, instrumento: lista.find((i) => i.id === s.instrumentoId) ?? null };
  }

  async list(estabelecimentoId: string, q?: string) {
    const dias = await this.diasAlerta(estabelecimentoId);
    const rows = await this.prisma.instrumentoPadrao.findMany({
      where: {
        estabelecimentoId,
        ativo: true,
        ...(q
          ? {
              OR: [
                { nome: { contains: q, mode: "insensitive" } },
                { nSerie: { contains: q, mode: "insensitive" } },
                { fabricante: { contains: q, mode: "insensitive" } },
                { modelo: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: {
        certificados: {
          where: CERT_ATUAL,
          take: 1,
          orderBy: { dataValidade: "desc" },
          select: {
            id: true,
            numero: true,
            dataValidade: true,
            laboratorioEmissor: true,
            fatorAbrangencia: true,
            pontos: { select: { incertezaExpandida: true, fatorK: true }, orderBy: [{ ordem: "asc" }, { id: "asc" }] },
            _count: { select: { pontos: true } },
          },
        },
        _count: { select: { certificados: true } },
      },
      orderBy: { nome: "asc" },
    });

    return rows.map((r) => {
      const vigente = r.certificados[0] ?? null;
      const validade = vigente?.dataValidade ?? r.certificadoValidade;
      const st = statusCert(validade, dias);
      return {
        id: r.id,
        nome: r.nome,
        nSerie: r.nSerie,
        fabricante: r.fabricante,
        modelo: r.modelo,
        codigoPatrimonio: r.codigoPatrimonio,
        tipoAnalisador: r.tipoAnalisador,
        identificacaoExterna: r.identificacaoExterna,
        grandezas: r.grandezas,
        faixaMedicao: r.faixaMedicao,
        resolucao: r.resolucao,
        certificadoNumero: vigente?.numero ?? r.certificadoNumero,
        certificadoValidade: validade,
        laboratorioEmissor: vigente?.laboratorioEmissor ?? r.laboratorioEmissor,
        certificadosCount: r._count.certificados,
        pontosVigente: vigente?._count.pontos ?? 0,
        statusCertificado: st,
        vencido: st === "VENCIDO",
        selecionavel: (st === "VALIDO" || st === "A_VENCER") && (vigente?._count.pontos ?? 0) > 0,
        camposFaltando: [...camposObrigatoriosFaltando(r), ...problemasCertificadoVigente(vigente)],
        cadastroIncompleto:
          camposObrigatoriosFaltando(r).length > 0 || problemasCertificadoVigente(vigente).length > 0,
      };
    });
  }

  async get(estabelecimentoId: string, id: string) {
    const row = await this.prisma.instrumentoPadrao.findFirst({
      where: { id, estabelecimentoId, ativo: true },
      include: {
        certificados: {
          orderBy: [{ vigente: "desc" }, { dataValidade: "desc" }],
          include: {
            pontos: { orderBy: [{ ordem: "asc" }, { id: "asc" }] },
          },
        },
      },
    });
    if (!row) throw new NotFoundException("Padrão não encontrado");
    const dias = await this.diasAlerta(estabelecimentoId);

    const substituidos = new Set(row.certificados.map((c) => c.revisaoDeId).filter(Boolean));
    const vigente =
      row.certificados.find((c) => c.vigente && !substituidos.has(c.id)) ??
      row.certificados.find((c) => !substituidos.has(c.id)) ??
      row.certificados[0] ??
      null;
    const validade = vigente?.dataValidade ?? row.certificadoValidade;
    const st = statusCert(validade, dias);

    const usados = await this.certificadosUsados(estabelecimentoId, id);
    return {
      ...row,
      certificados: row.certificados.map((c) => ({
        usadoEmLaudoFinal: usados.has(c.id),
        ...c,
        anexoConteudo: undefined,
        temAnexo: Boolean(c.anexoConteudo && c.anexoConteudo.length > 0),
        statusCertificado: statusCert(c.dataValidade, dias),
        substituido: substituidos.has(c.id),
      })),
      statusCertificado: st,
      vencido: st === "VENCIDO",
      camposFaltando: [...camposObrigatoriosFaltando(row), ...problemasCertificadoVigente(vigente)],
      cadastroIncompleto:
        camposObrigatoriosFaltando(row).length > 0 || problemasCertificadoVigente(vigente).length > 0,
      pontosVigente: vigente?.pontos?.length ?? 0,
      selecionavel:
        (st === "VALIDO" || st === "A_VENCER") && (vigente?.pontos?.length ?? 0) > 0,
    };
  }

  async create(user: AuthUser, data: CreateInstrumentoInput) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "laudos")) throw new ForbiddenException();
    if (!data.nome?.trim() || !data.nSerie?.trim()) {
      throw new BadRequestException("Nome e nº de série obrigatórios");
    }
    const faltaCriar = camposObrigatoriosFaltando(data);
    if (faltaCriar.length) throw new BadRequestException(`Preencha os campos obrigatórios: ${faltaCriar.join(", ")}`);
    const nSerie = normalizarNSerie(data.nSerie);
    await this.garantirNSerieLivre(user.estabelecimentoId, nSerie);

    const grandezas = (data.grandezas ?? [])
      .map((g) => g.trim())
      .filter(Boolean);

    const created = await this.prisma.instrumentoPadrao
      .create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        nome: data.nome.trim(),
        nSerie,
        fabricante: data.fabricante?.trim() || null,
        modelo: data.modelo?.trim() || null,
        codigoPatrimonio: data.codigoPatrimonio?.trim() || null,
        tipoAnalisador: data.tipoAnalisador?.trim() || null,
        identificacaoExterna: data.identificacaoExterna?.trim() || null,
        grandezas,
        faixaMedicao: data.faixaMedicao?.trim() || null,
        resolucao: data.resolucao?.trim() || null,
        observacoes: data.observacoes?.trim() || null,
        certificadoNumero: data.certificadoNumero?.trim() || null,
        certificadoEmissao: data.certificadoEmissao
          ? new Date(data.certificadoEmissao)
          : null,
        certificadoValidade: data.certificadoValidade
          ? new Date(data.certificadoValidade)
          : null,
        laboratorioEmissor: data.laboratorioEmissor?.trim() || null,
      },
    })
      .catch((e: { code?: string }) => {
        if (e?.code === "P2002") throw new ConflictException(`Já existe um padrão com o nº de série ${nSerie} neste estabelecimento`);
        throw e;
      });

    // Se já veio validade no cadastro rápido, cria certificado vigente sem pontos
    if (data.certificadoValidade && data.certificadoNumero) {
      await this.prisma.certificadoPadrao.create({
        data: {
          estabelecimentoId: user.estabelecimentoId,
          instrumentoId: created.id,
          numero: data.certificadoNumero.trim(),
          dataEmissao: data.certificadoEmissao
            ? new Date(data.certificadoEmissao)
            : new Date(data.certificadoValidade),
          dataValidade: new Date(data.certificadoValidade),
          laboratorioEmissor: data.laboratorioEmissor?.trim() || null,
          vigente: true,
        },
      });
    }

    return this.get(user.estabelecimentoId, created.id);
  }

  async update(
    user: AuthUser,
    id: string,
    data: Partial<CreateInstrumentoInput> & { ativo?: boolean },
  ) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "laudos")) throw new ForbiddenException();
    const existing = await this.prisma.instrumentoPadrao.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!existing) throw new NotFoundException("Padrão não encontrado");
    // Edição de cadastro exige o registro completo; só ativar/inativar não exige (antigos seguem válidos).
    if (Object.keys(data).some((k) => k !== "ativo" && (data as Record<string, unknown>)[k] !== undefined)) {
      const merged = {
        tipoAnalisador: data.tipoAnalisador !== undefined ? data.tipoAnalisador : existing.tipoAnalisador,
        grandezas: data.grandezas !== undefined ? data.grandezas : existing.grandezas,
        faixaMedicao: data.faixaMedicao !== undefined ? data.faixaMedicao : existing.faixaMedicao,
        resolucao: data.resolucao !== undefined ? data.resolucao : existing.resolucao,
      };
      const falta = camposObrigatoriosFaltando(merged);
      if (falta.length) throw new BadRequestException(`Preencha os campos obrigatórios: ${falta.join(", ")}`);
    }
    if (data.nSerie != null) {
      const ns = normalizarNSerie(data.nSerie);
      if (!ns) throw new BadRequestException("Nº de série obrigatório");
      await this.garantirNSerieLivre(user.estabelecimentoId, ns, id);
      data = { ...data, nSerie: ns };
    }

    await this.prisma.instrumentoPadrao.update({
      where: { id },
      data: {
        ...(data.nome != null ? { nome: data.nome.trim() } : {}),
        ...(data.nSerie != null ? { nSerie: data.nSerie.trim() } : {}),
        ...(data.fabricante !== undefined
          ? { fabricante: data.fabricante?.trim() || null }
          : {}),
        ...(data.modelo !== undefined ? { modelo: data.modelo?.trim() || null } : {}),
        ...(data.codigoPatrimonio !== undefined
          ? { codigoPatrimonio: data.codigoPatrimonio?.trim() || null }
          : {}),
        ...(data.tipoAnalisador !== undefined
          ? { tipoAnalisador: data.tipoAnalisador?.trim() || null }
          : {}),
        ...(data.identificacaoExterna !== undefined
          ? { identificacaoExterna: data.identificacaoExterna?.trim() || null }
          : {}),
        ...(data.grandezas !== undefined
          ? { grandezas: data.grandezas.map((g) => g.trim()).filter(Boolean) }
          : {}),
        ...(data.faixaMedicao !== undefined
          ? { faixaMedicao: data.faixaMedicao?.trim() || null }
          : {}),
        ...(data.resolucao !== undefined
          ? { resolucao: data.resolucao?.trim() || null }
          : {}),
        ...(data.observacoes !== undefined
          ? { observacoes: data.observacoes?.trim() || null }
          : {}),
        ...(data.ativo !== undefined ? { ativo: data.ativo } : {}),
      },
    });

    return this.get(user.estabelecimentoId, id);
  }

  async addCertificado(user: AuthUser, instrumentoId: string, data: CreateCertificadoInput) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "laudos")) throw new ForbiddenException();
    const inst = await this.prisma.instrumentoPadrao.findFirst({
      where: { id: instrumentoId, estabelecimentoId: user.estabelecimentoId, ativo: true },
    });
    if (!inst) throw new NotFoundException("Padrão não encontrado");

    const pontos = data.pontos ?? [];
    const anexoMime = data.anexoDataUrl ? parseDataUrl(data.anexoDataUrl).mime : null;
    const erros = validarCertificadoPadrao({ ...data, pontos, anexoMime });
    if (erros.length) throw new BadRequestException(erros.join("; "));
    const dupCert = await this.prisma.certificadoPadrao.findFirst({
      where: { instrumentoId, numero: data.numero.trim() },
      select: { id: true },
    });
    if (dupCert) throw new ConflictException(`Certificado ${data.numero.trim()} já cadastrado para este padrão`);

    let anexo: { nome: string; mime: string; buffer: Buffer } | null = null;
    if (data.anexoDataUrl) {
      const parsed = parseDataUrl(data.anexoDataUrl);
      if (parsed.buffer.length > 15 * 1024 * 1024) {
        throw new BadRequestException("PDF do certificado excede 15 MB");
      }
      anexo = {
        nome: data.anexoNome?.trim() || `${data.numero.trim()}.pdf`,
        mime: parsed.mime || "application/pdf",
        buffer: parsed.buffer,
      };
    }

    const marcarVigente = data.vigente !== false;

    const created = await this.prisma.$transaction(async (tx) => {
      if (marcarVigente) {
        await tx.certificadoPadrao.updateMany({
          where: { instrumentoId, vigente: true },
          data: { vigente: false },
        });
      }

      const cert = await tx.certificadoPadrao.create({
        data: {
          estabelecimentoId: user.estabelecimentoId,
          instrumentoId,
          numero: data.numero.trim(),
          dataEmissao: new Date(data.dataEmissao),
          dataValidade: new Date(data.dataValidade),
          laboratorioEmissor: data.laboratorioEmissor?.trim() || null,
          laboratorioAcreditacao: data.laboratorioAcreditacao?.trim() || null,
          // sem default 2: vazio = não informado (o ponto precisa trazer k; validado acima)
          fatorAbrangencia: data.fatorAbrangencia ?? null,
          probabilidadeAbrangencia: data.probabilidadeAbrangencia ?? null,
          observacoes: data.observacoes?.trim() || null,
          vigente: marcarVigente,
          anexoNome: anexo?.nome,
          anexoMime: anexo?.mime,
          anexoConteudo: anexo ? new Uint8Array(anexo.buffer) : undefined,
          pontos: { create: pontosParaCriar(pontos) },
        },
        include: { pontos: { orderBy: { ordem: "asc" } } },
      });

      if (marcarVigente) {
        await tx.instrumentoPadrao.update({
          where: { id: instrumentoId },
          data: {
            certificadoNumero: cert.numero,
            certificadoEmissao: cert.dataEmissao,
            certificadoValidade: cert.dataValidade,
            laboratorioEmissor: cert.laboratorioEmissor,
          },
        });
      }

      return cert;
    });

    return {
      ...created,
      anexoConteudo: undefined,
      temAnexo: Boolean(anexo),
      statusCertificado: statusCert(created.dataValidade, await this.diasAlerta(user.estabelecimentoId)),
    };
  }

  /** Ids de certificados deste padrão usados em laudo FINAL (snapshot). */
  private async certificadosUsados(estabelecimentoId: string, instrumentoId: string): Promise<Set<string>> {
    const ls = await this.prisma.laudo?.findMany?.({
      where: { estabelecimentoId, instrumentoId, statusDocumento: "FINAL" },
      select: { instrumentoSnapshot: true },
    });
    const ids = (ls ?? [])
      .map((l) => (l.instrumentoSnapshot as { certificado?: { id?: string } } | null)?.certificado?.id)
      .filter((x): x is string => Boolean(x));
    return new Set(ids);
  }

  /** Certificado usado em laudo FINAL (snapshot do instrumento aponta para ele) — critério 2a. */
  private async certificadoUsado(estabelecimentoId: string, certificadoId: string): Promise<boolean> {
    const l = await this.prisma.laudo.findFirst({
      where: {
        estabelecimentoId,
        statusDocumento: "FINAL",
        instrumentoSnapshot: { path: ["certificado", "id"], equals: certificadoId },
      },
      select: { id: true },
    });
    return Boolean(l);
  }

  private async registrarAuditoria(user: AuthUser, acao: string, detalhe: Record<string, unknown>) {
    // reaproveita o log existente (LogAcesso): quem (usuarioId), quando (createdAt), antes/depois (JSON)
    await this.prisma.logAcesso.create({
      data: { usuarioId: user.userId ?? null, acao, detalhe: JSON.stringify({ estabelecimentoId: user.estabelecimentoId, ...detalhe }) },
    });
  }

  private validarEntrada(data: CreateCertificadoInput) {
    const pontos = data.pontos ?? [];
    const anexo = data.anexoDataUrl ? parseDataUrl(data.anexoDataUrl) : null;
    const erros = validarCertificadoPadrao({ ...data, pontos, anexoMime: anexo?.mime ?? null });
    if (erros.length) throw new BadRequestException(erros.join("; "));
    if (anexo && anexo.buffer.length > 15 * 1024 * 1024) throw new BadRequestException("PDF do certificado excede 15 MB");
    return { pontos, anexo };
  }

  private camposCert(data: CreateCertificadoInput) {
    return {
      numero: data.numero.trim(),
      dataEmissao: new Date(data.dataEmissao),
      dataValidade: new Date(data.dataValidade),
      laboratorioEmissor: data.laboratorioEmissor?.trim() || null,
      laboratorioAcreditacao: data.laboratorioAcreditacao?.trim() || null,
      fatorAbrangencia: data.fatorAbrangencia ?? null,
      probabilidadeAbrangencia: data.probabilidadeAbrangencia ?? null,
      observacoes: data.observacoes?.trim() || null,
    };
  }

  private async carregarCert(user: AuthUser, instrumentoId: string, certificadoId: string) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "laudos")) throw new ForbiddenException();
    const atual = await this.prisma.certificadoPadrao.findFirst({
      where: { id: certificadoId, instrumentoId, estabelecimentoId: user.estabelecimentoId },
      include: { pontos: { orderBy: [{ ordem: "asc" }, { id: "asc" }] } },
    });
    if (!atual) throw new NotFoundException("Certificado não encontrado");
    return atual;
  }

  private semAnexo<T extends { anexoConteudo?: unknown }>(c: T) {
    const { anexoConteudo, ...resto } = c as T & { anexoConteudo?: Uint8Array | null };
    return { ...resto, temAnexo: Boolean(anexoConteudo && anexoConteudo.length) };
  }

  /**
   * PATCH do certificado. Sem uso em laudo final: edita no lugar (mesmas validações) e audita.
   * Usado em laudo final: só `observacoes` muda no lugar (auditado); qualquer outra alteração → 409.
   */
  async updateCertificado(user: AuthUser, instrumentoId: string, certificadoId: string, data: CreateCertificadoInput) {
    const atual = await this.carregarCert(user, instrumentoId, certificadoId);
    const { pontos, anexo } = this.validarEntrada(data);
    const campos = this.camposCert(data);
    const usado = await this.certificadoUsado(user.estabelecimentoId, certificadoId);
    const antes = this.semAnexo(atual);

    if (usado) {
      const mudouMetrologia =
        Boolean(anexo) ||
        assinaturaMetrologica({ ...atual, pontos: atual.pontos }) !== assinaturaMetrologica({ ...campos, pontos: pontosParaCriar(pontos) });
      if (mudouMetrologia) throw new ConflictException(MSG_CERT_USADO);
      const salvo = await this.prisma.certificadoPadrao.update({
        where: { id: certificadoId },
        data: { observacoes: campos.observacoes },
        include: { pontos: { orderBy: { ordem: "asc" } } },
      });
      await this.registrarAuditoria(user, "CERTIFICADO_PADRAO_OBSERVACOES", {
        certificadoId, antes: { observacoes: atual.observacoes }, depois: { observacoes: salvo.observacoes },
      });
      return { ...this.semAnexo(salvo), modo: "observacoes" as const };
    }

    if (campos.numero !== atual.numero) {
      const dup = await this.prisma.certificadoPadrao.findFirst({ where: { instrumentoId, numero: campos.numero }, select: { id: true } });
      if (dup) throw new ConflictException(`Certificado ${campos.numero} já cadastrado para este padrão`);
    }
    const salvo = await this.prisma.$transaction(async (tx) => {
      await tx.certificadoPadraoPonto.deleteMany({ where: { certificadoId } });
      return tx.certificadoPadrao.update({
        where: { id: certificadoId },
        data: {
          ...campos,
          ...(anexo ? { anexoNome: data.anexoNome || `${campos.numero}.pdf`, anexoMime: anexo.mime, anexoConteudo: new Uint8Array(anexo.buffer) } : {}),
          pontos: { create: pontosParaCriar(pontos) },
        },
        include: { pontos: { orderBy: { ordem: "asc" } } },
      });
    });
    await this.registrarAuditoria(user, "CERTIFICADO_PADRAO_EDITADO", { certificadoId, antes, depois: this.semAnexo(salvo) });
    await this.sincronizarSnapshotInstrumento(instrumentoId, salvo);
    return { ...this.semAnexo(salvo), modo: "no_lugar" as const };
  }

  /**
   * Revisão explícita (POST .../certificados/:certId/revisoes): cria certificado novo ligado ao anterior
   * (revisao+1, revisaoDeId), vigente; o anterior só deixa de ser vigente — dados, pontos e PDF intactos,
   * então o laudo emitido continua idêntico. PDF não enviado = herda o do anterior. Mesmas validações.
   */
  async criarRevisao(user: AuthUser, instrumentoId: string, certificadoId: string, data: CreateCertificadoInput) {
    const atual = await this.carregarCert(user, instrumentoId, certificadoId);
    const ja = await this.prisma.certificadoPadrao.findFirst({ where: { revisaoDeId: certificadoId }, select: { id: true } });
    if (ja) throw new ConflictException("Este certificado já tem revisão — revise a revisão mais recente");
    const { pontos, anexo } = this.validarEntrada(data);
    const campos = this.camposCert(data);
    if (!atual.vigente) throw new ConflictException("Só o certificado vigente pode ser revisado");
    const salvo = await this.prisma.$transaction(async (tx) => {
      // update condicional: em revisões simultâneas só uma encontra vigente=true (a outra → 409);
      // o índice único (instrumentoId, numero, revisao) é a segunda trava.
      const r = await tx.certificadoPadrao.updateMany({ where: { id: certificadoId, vigente: true }, data: { vigente: false } });
      if (r.count !== 1) throw new ConflictException("Este certificado já tem revisão — revise a revisão mais recente");
      return tx.certificadoPadrao.create({
        data: {
          ...campos,
          estabelecimentoId: user.estabelecimentoId,
          instrumentoId,
          vigente: true,
          revisao: (atual.revisao ?? 0) + 1,
          revisaoDeId: atual.id,
          anexoNome: anexo ? data.anexoNome || `${campos.numero}.pdf` : atual.anexoNome,
          anexoMime: anexo ? anexo.mime : atual.anexoMime,
          anexoConteudo: anexo ? new Uint8Array(anexo.buffer) : (atual.anexoConteudo ?? undefined),
          pontos: { create: pontosParaCriar(pontos) },
        },
        include: { pontos: { orderBy: { ordem: "asc" } } },
      });
    }).catch((e: unknown) => {
      if ((e as { code?: string })?.code === "P2002") {
        throw new ConflictException("Este certificado já tem revisão — revise a revisão mais recente");
      }
      throw e;
    });
    await this.registrarAuditoria(user, "CERTIFICADO_PADRAO_REVISAO", {
      certificadoAnteriorId: certificadoId, certificadoId: salvo.id, antes: this.semAnexo(atual), depois: this.semAnexo(salvo),
    });
    await this.sincronizarSnapshotInstrumento(instrumentoId, salvo);
    return { ...this.semAnexo(salvo), modo: "revisao" as const };
  }

  private async sincronizarSnapshotInstrumento(
    instrumentoId: string,
    c: { vigente: boolean; numero: string; dataEmissao: Date; dataValidade: Date; laboratorioEmissor: string | null },
  ) {
    if (!c.vigente) return;
    await this.prisma.instrumentoPadrao.update({
      where: { id: instrumentoId },
      data: {
        certificadoNumero: c.numero,
        certificadoEmissao: c.dataEmissao,
        certificadoValidade: c.dataValidade,
        laboratorioEmissor: c.laboratorioEmissor,
      },
    });
  }

  async certificadoPdf(estabelecimentoId: string, instrumentoId: string, certificadoId: string) {
    const cert = await this.prisma.certificadoPadrao.findFirst({
      where: { id: certificadoId, instrumentoId, estabelecimentoId },
      select: { anexoNome: true, anexoMime: true, anexoConteudo: true, numero: true },
    });
    if (!cert) throw new NotFoundException("Certificado não encontrado");
    if (!cert.anexoConteudo?.length) throw new NotFoundException("Certificado sem PDF anexado");
    return {
      nomeArquivo: cert.anexoNome || `${cert.numero}.pdf`,
      mimeType: cert.anexoMime || "application/pdf",
      conteudo: cert.anexoConteudo,
    };
  }

  async listPreferenciais(estabelecimentoId: string) {
    const [instrumentos, prefs] = await Promise.all([
      this.prisma.instrumentoPadrao.findMany({
        where: { estabelecimentoId, ativo: true },
        select: {
          id: true,
          nome: true,
          nSerie: true,
          fabricante: true,
          modelo: true,
          tipoAnalisador: true,
          identificacaoExterna: true,
        },
        orderBy: { nome: "asc" },
      }),
      this.prisma.padraoPreferencial.findMany({
        where: { estabelecimentoId },
        include: {
          instrumento: {
            select: { id: true, nome: true, nSerie: true, fabricante: true, modelo: true },
          },
        },
        orderBy: { tipo: "asc" },
      }),
    ]);

    const tipos = new Set<string>();
    for (const i of instrumentos) {
      const t = i.tipoAnalisador?.trim();
      if (t) tipos.add(t);
    }
    for (const p of prefs) tipos.add(p.tipo);

    return {
      tipos: [...tipos].sort((a, b) => a.localeCompare(b, "pt-BR")),
      instrumentos,
      preferenciais: prefs.map((p) => ({
        tipo: p.tipo,
        instrumentoId: p.instrumentoId,
        instrumento: p.instrumento,
      })),
    };
  }

  async salvarPreferenciais(
    user: AuthUser,
    itens: Array<{ tipo: string; instrumentoId?: string | null }>,
  ) {
    if (!podeEditarModulo(user.perfil, user.permissoesModulos, "laudos")) {
      throw new ForbiddenException();
    }

    const ops: Array<{ tipo: string; instrumentoId: string }> = [];
    for (const item of itens) {
      const tipo = item.tipo?.trim();
      if (!tipo) continue;
      const instrumentoId = item.instrumentoId?.trim() || "";
      if (!instrumentoId) {
        ops.push({ tipo, instrumentoId: "" });
        continue;
      }
      const inst = await this.prisma.instrumentoPadrao.findFirst({
        where: { id: instrumentoId, estabelecimentoId: user.estabelecimentoId, ativo: true },
        select: { id: true, nome: true, nSerie: true, tipoAnalisador: true },
      });
      if (!inst) throw new BadRequestException(`Padrão inválido para o tipo ${tipo}`);
      if (!preferencialCompativel(tipo, inst.tipoAnalisador)) {
        throw new BadRequestException(
          inst.tipoAnalisador?.trim()
            ? `O padrão ${inst.nome} (${inst.nSerie}) é do tipo "${inst.tipoAnalisador}" e não pode ser preferencial de "${tipo}".`
            : `O padrão ${inst.nome} (${inst.nSerie}) não tem tipo de analisador cadastrado; complete o cadastro antes de usá-lo como preferencial de "${tipo}".`,
        );
      }
      ops.push({ tipo, instrumentoId });
    }

    for (const { tipo, instrumentoId } of ops) {
      if (!instrumentoId) {
        await this.prisma.padraoPreferencial.deleteMany({
          where: { estabelecimentoId: user.estabelecimentoId, tipo },
        });
        continue;
      }
      await this.prisma.padraoPreferencial.upsert({
        where: {
          estabelecimentoId_tipo: { estabelecimentoId: user.estabelecimentoId, tipo },
        },
        create: {
          estabelecimentoId: user.estabelecimentoId,
          tipo,
          instrumentoId,
        },
        update: { instrumentoId },
      });
    }

    return this.listPreferenciais(user.estabelecimentoId);
  }
}
