import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { podeEditarCadastros } from "@aion/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

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

function statusCert(validade: Date | null | undefined) {
  if (!validade) return "SEM_CERTIFICADO" as const;
  const dias = (validade.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (dias < 0) return "VENCIDO" as const;
  if (dias <= 60) return "A_VENCER" as const;
  return "VALIDO" as const;
}

@Injectable()
export class InstrumentosService {
  constructor(private readonly prisma: PrismaService) {}

  async list(estabelecimentoId: string, q?: string) {
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
      const st = statusCert(validade);
      return {
        id: r.id,
        nome: r.nome,
        nSerie: r.nSerie,
        fabricante: r.fabricante,
        modelo: r.modelo,
        codigoPatrimonio: r.codigoPatrimonio,
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

    const vigente = row.certificados.find((c) => c.vigente) ?? row.certificados[0] ?? null;
    const validade = vigente?.dataValidade ?? row.certificadoValidade;
    const st = statusCert(validade);

    return {
      ...row,
      certificados: row.certificados.map((c) => ({
        ...c,
        anexoConteudo: undefined,
        temAnexo: Boolean(c.anexoConteudo && c.anexoConteudo.length > 0),
        statusCertificado: statusCert(c.dataValidade),
      })),
      statusCertificado: st,
      vencido: st === "VENCIDO",
      pontosVigente: vigente?.pontos?.length ?? 0,
      selecionavel:
        (st === "VALIDO" || st === "A_VENCER") && (vigente?.pontos?.length ?? 0) > 0,
    };
  }

  async create(user: AuthUser, data: CreateInstrumentoInput) {
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    if (!data.nome?.trim() || !data.nSerie?.trim()) {
      throw new BadRequestException("Nome e nº de série obrigatórios");
    }

    const grandezas = (data.grandezas ?? [])
      .map((g) => g.trim())
      .filter(Boolean);

    const created = await this.prisma.instrumentoPadrao.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        nome: data.nome.trim(),
        nSerie: data.nSerie.trim(),
        fabricante: data.fabricante?.trim() || null,
        modelo: data.modelo?.trim() || null,
        codigoPatrimonio: data.codigoPatrimonio?.trim() || null,
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
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    const existing = await this.prisma.instrumentoPadrao.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId },
    });
    if (!existing) throw new NotFoundException("Padrão não encontrado");

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
    if (!podeEditarCadastros(user.perfil, user.permissoesModulos)) throw new ForbiddenException();
    const inst = await this.prisma.instrumentoPadrao.findFirst({
      where: { id: instrumentoId, estabelecimentoId: user.estabelecimentoId, ativo: true },
    });
    if (!inst) throw new NotFoundException("Padrão não encontrado");

    if (!data.numero?.trim()) throw new BadRequestException("Número do certificado obrigatório");
    if (!data.dataEmissao || !data.dataValidade) {
      throw new BadRequestException("Emissão e validade obrigatórias");
    }

    const pontos = data.pontos ?? [];
    for (const [i, p] of pontos.entries()) {
      if (!p.unidade?.trim()) {
        throw new BadRequestException(`Ponto ${i + 1}: unidade obrigatória`);
      }
      if (p.incertezaExpandida == null || Number.isNaN(Number(p.incertezaExpandida))) {
        throw new BadRequestException(`Ponto ${i + 1}: incerteza expandida (U) obrigatória`);
      }
    }

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
      statusCertificado: statusCert(created.dataValidade),
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
}
