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
  normalizarNSerie,
  sugerirPadrao,
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
  observacoes?: string;
  vigente?: boolean;
  pontos?: PontoInput[];
  /** data URL base64: data:application/pdf;base64,... */
  anexoDataUrl?: string;
  anexoNome?: string;
};

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
  async sugestao(estabelecimentoId: string, tipo?: string) {
    const [prefs, lista] = await Promise.all([
      this.prisma.padraoPreferencial.findMany({
        where: { estabelecimentoId },
        select: { tipo: true, instrumentoId: true },
      }),
      this.list(estabelecimentoId),
    ]);
    const s = sugerirPadrao(tipo, prefs, lista);
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
          where: { vigente: true },
          take: 1,
          orderBy: { dataValidade: "desc" },
          select: {
            id: true,
            numero: true,
            dataValidade: true,
            laboratorioEmissor: true,
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

    const vigente = row.certificados.find((c) => c.vigente) ?? row.certificados[0] ?? null;
    const validade = vigente?.dataValidade ?? row.certificadoValidade;
    const st = statusCert(validade, dias);

    return {
      ...row,
      certificados: row.certificados.map((c) => ({
        ...c,
        anexoConteudo: undefined,
        temAnexo: Boolean(c.anexoConteudo && c.anexoConteudo.length > 0),
        statusCertificado: statusCert(c.dataValidade, dias),
      })),
      statusCertificado: st,
      vencido: st === "VENCIDO",
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
          fatorAbrangencia: data.fatorAbrangencia ?? 2,
          observacoes: data.observacoes?.trim() || null,
          vigente: marcarVigente,
          anexoNome: anexo?.nome,
          anexoMime: anexo?.mime,
          anexoConteudo: anexo ? new Uint8Array(anexo.buffer) : undefined,
          pontos: {
            create: pontos.map((p, idx) => ({
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
              fatorK: p.fatorK ?? data.fatorAbrangencia ?? 2,
              observacao: p.observacao?.trim() || null,
            })),
          },
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

    for (const item of itens) {
      const tipo = item.tipo?.trim();
      if (!tipo) continue;
      const instrumentoId = item.instrumentoId?.trim() || "";
      if (!instrumentoId) {
        await this.prisma.padraoPreferencial.deleteMany({
          where: { estabelecimentoId: user.estabelecimentoId, tipo },
        });
        continue;
      }
      const inst = await this.prisma.instrumentoPadrao.findFirst({
        where: { id: instrumentoId, estabelecimentoId: user.estabelecimentoId, ativo: true },
        select: { id: true },
      });
      if (!inst) throw new BadRequestException(`Padrão inválido para o tipo ${tipo}`);
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
