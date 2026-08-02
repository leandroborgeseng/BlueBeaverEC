import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EtapaJornada, SituacaoContrato, SituacaoEquipamento, StatusNC, StatusOS } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

const ETAPAS: EtapaJornada[] = [
  EtapaJornada.DIAGNOSTICO,
  EtapaJornada.PRIORIZACAO,
  EtapaJornada.PLANO,
  EtapaJornada.IMPLANTACAO,
  EtapaJornada.EVIDENCIAS,
  EtapaJornada.AVALIACAO,
  EtapaJornada.MELHORIA_CONTINUA,
];

@Injectable()
export class EstrategicoService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboardExecutivo(estabelecimentoId: string) {
    const [maturidade, conformidade, disponibilidade, riscos, contratos, recomendacoes, prioridades] =
      await Promise.all([
        this.indiceMaturidade(estabelecimentoId),
        this.indiceConformidade(estabelecimentoId),
        this.disponibilidade(estabelecimentoId),
        this.riscosCriticos(estabelecimentoId),
        this.prisma.contrato.findMany({
          where: {
            estabelecimentoId,
            situacao: { in: [SituacaoContrato.A_VENCER, SituacaoContrato.VENCIDO] },
          },
          include: { fornecedor: true },
          take: 8,
          orderBy: { vigenciaFim: "asc" },
        }),
        this.prisma.recomendacaoInstitucional.findMany({
          where: { estabelecimentoId, concluida: false },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        this.prisma.ordemServico.findMany({
          where: {
            estabelecimentoId,
            status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] },
            prioridade: { in: ["ALTA", "URGENTE"] },
          },
          include: { equipamento: true },
          take: 8,
          orderBy: { abertura: "desc" },
        }),
      ]);

    const evolucao = await this.listMaturidade(estabelecimentoId);

    return {
      indiceMaturidadePct: maturidade.pct,
      nivelMaturidade: maturidade.nivel,
      indiceConformidadePct: conformidade,
      disponibilidadePct: disponibilidade,
      riscosCriticos: riscos,
      evolucaoPorDominio: evolucao.map((d) => ({
        codigo: d.codigo,
        nome: d.nome,
        nivel: d.avaliacao?.nivel ?? null,
        peso: d.peso,
      })),
      contratosVencendo: contratos,
      recomendacoes,
      prioridadesMes: prioridades,
    };
  }

  async indiceMaturidade(estabelecimentoId: string) {
    const dominios = await this.prisma.dominioMaturidade.findMany({ orderBy: { ordem: "asc" } });
    const avaliacoes = await this.prisma.avaliacaoMaturidade.findMany({ where: { estabelecimentoId } });
    const byDom = new Map(avaliacoes.map((a) => [a.dominioId, a]));
    if (dominios.length === 0) return { pct: null as number | null, nivel: null as number | null };

    let somaPeso = 0;
    let somaNivelPeso = 0;
    let avaliados = 0;
    for (const d of dominios) {
      const a = byDom.get(d.id);
      if (!a) continue;
      avaliados += 1;
      somaPeso += d.peso;
      somaNivelPeso += a.nivel * d.peso;
    }
    if (avaliados === 0) return { pct: null, nivel: null };
    const media = somaNivelPeso / somaPeso;
    return {
      pct: Number(((media / 5) * 100).toFixed(1)),
      nivel: Number(media.toFixed(1)),
    };
  }

  private async indiceConformidade(estabelecimentoId: string) {
    const requisitos = await this.prisma.requisitoNormativo.count({ where: { ativo: true } });
    if (requisitos === 0) return null;
    const evidencias = await this.prisma.evidenciaConformidade.findMany({
      where: { estabelecimentoId },
      orderBy: { dataUpload: "desc" },
    });
    const latest = new Map<string, (typeof evidencias)[0]>();
    for (const e of evidencias) {
      if (!latest.has(e.requisitoId)) latest.set(e.requisitoId, e);
    }
    let conformes = 0;
    for (const e of latest.values()) {
      if (e.status === "CONFORME") conformes += 1;
      else if (e.status === "PARCIAL") conformes += 0.5;
    }
    return Number(((conformes / requisitos) * 100).toFixed(1));
  }

  private async disponibilidade(estabelecimentoId: string) {
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
    if (total === 0) return null;
    return Number(((ativos / total) * 100).toFixed(1));
  }

  private async riscosCriticos(estabelecimentoId: string) {
    const [ncAbertas, osUrgentes, anvisaVencida] = await Promise.all([
      this.prisma.naoConformidade.count({
        where: { estabelecimentoId, status: { not: StatusNC.FECHADA } },
      }),
      this.prisma.ordemServico.count({
        where: {
          estabelecimentoId,
          prioridade: "URGENTE",
          status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] },
        },
      }),
      this.prisma.equipamento.count({
        where: {
          estabelecimentoId,
          validadeAnvisa: { lt: new Date() },
          situacao: { not: SituacaoEquipamento.ARQUIVADO },
        },
      }),
    ]);
    return { ncAbertas, osUrgentes, anvisaVencida, total: ncAbertas + osUrgentes + anvisaVencida };
  }

  async listMaturidade(estabelecimentoId: string) {
    const dominios = await this.prisma.dominioMaturidade.findMany({ orderBy: { ordem: "asc" } });
    const avaliacoes = await this.prisma.avaliacaoMaturidade.findMany({ where: { estabelecimentoId } });
    const byDom = new Map(avaliacoes.map((a) => [a.dominioId, a]));
    return dominios.map((d) => ({
      ...d,
      avaliacao: byDom.get(d.id) ?? null,
    }));
  }

  async upsertAvaliacao(
    user: AuthUser,
    dominioId: string,
    body: { nivel: number; gaps?: unknown; evidencias?: unknown; planoAcao?: string },
  ) {
    if (body.nivel < 1 || body.nivel > 5) throw new BadRequestException("Nível deve ser 1-5");
    const dominio = await this.prisma.dominioMaturidade.findUnique({ where: { id: dominioId } });
    if (!dominio) throw new NotFoundException("Domínio não encontrado");

    const avaliacao = await this.prisma.avaliacaoMaturidade.upsert({
      where: {
        estabelecimentoId_dominioId: {
          estabelecimentoId: user.estabelecimentoId,
          dominioId,
        },
      },
      create: {
        estabelecimentoId: user.estabelecimentoId,
        dominioId,
        nivel: body.nivel,
        gaps: (body.gaps as object) ?? [],
        evidencias: (body.evidencias as object) ?? [],
        planoAcao: body.planoAcao,
        avaliadoPorId: user.userId,
      },
      update: {
        nivel: body.nivel,
        gaps: (body.gaps as object) ?? [],
        evidencias: (body.evidencias as object) ?? [],
        planoAcao: body.planoAcao,
        avaliadoPorId: user.userId,
        avaliadoEm: new Date(),
      },
    });

    if (body.nivel <= 2) {
      await this.prisma.recomendacaoInstitucional.create({
        data: {
          estabelecimentoId: user.estabelecimentoId,
          titulo: `Elevar maturidade em ${dominio.nome} (nível ${body.nivel})`,
          origem: "Maturidade",
          prioridade: body.nivel === 1 ? "ALTA" : "MEDIA",
        },
      });
    }

    return avaliacao;
  }

  async getJornada(estabelecimentoId: string) {
    let j = await this.prisma.jornadaEvolucao.findUnique({ where: { estabelecimentoId } });
    if (!j) {
      j = await this.prisma.jornadaEvolucao.create({
        data: { estabelecimentoId, etapaAtual: EtapaJornada.DIAGNOSTICO },
      });
    }
    return { ...j, etapas: ETAPAS };
  }

  async setJornada(estabelecimentoId: string, etapaAtual: EtapaJornada, notas?: object) {
    if (!ETAPAS.includes(etapaAtual)) throw new BadRequestException("Etapa inválida");
    return this.prisma.jornadaEvolucao.upsert({
      where: { estabelecimentoId },
      create: { estabelecimentoId, etapaAtual, notas: notas ?? {} },
      update: { etapaAtual, ...(notas ? { notas } : {}) },
    });
  }

  listRequisitos() {
    return this.prisma.requisitoNormativo.findMany({
      where: { ativo: true },
      orderBy: [{ categoria: "asc" }, { codigo: "asc" }],
    });
  }

  async centralConformidade(estabelecimentoId: string) {
    const requisitos = await this.listRequisitos();
    const evidencias = await this.prisma.evidenciaConformidade.findMany({
      where: { estabelecimentoId },
      orderBy: { dataUpload: "desc" },
    });
    const latest = new Map<string, (typeof evidencias)[0]>();
    for (const e of evidencias) {
      if (!latest.has(e.requisitoId)) latest.set(e.requisitoId, e);
    }
    return requisitos.map((r) => ({
      ...r,
      evidencia: latest.get(r.id) ?? null,
      status: latest.get(r.id)?.status ?? "SEM_EVIDENCIA",
    }));
  }

  async addEvidencia(
    user: AuthUser,
    body: {
      requisitoId: string;
      tipo: string;
      descricao?: string;
      arquivoUrl?: string;
      status?: "CONFORME" | "PARCIAL" | "NAO_CONFORME" | "SEM_EVIDENCIA";
    },
  ) {
    const req = await this.prisma.requisitoNormativo.findUnique({ where: { id: body.requisitoId } });
    if (!req) throw new NotFoundException("Requisito não encontrado");
    return this.prisma.evidenciaConformidade.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        requisitoId: body.requisitoId,
        tipo: body.tipo,
        descricao: body.descricao,
        arquivoUrl: body.arquivoUrl,
        status: body.status ?? "PARCIAL",
        uploadedById: user.userId,
      },
    });
  }

  listPops(estabelecimentoId: string) {
    return this.prisma.pop.findMany({
      where: { estabelecimentoId },
      include: { procedimentoLaudo: true },
      orderBy: { codigo: "asc" },
    });
  }

  async createPop(
    user: AuthUser,
    body: { codigo: string; titulo: string; versao?: string; procedimentoLaudoId?: string },
  ) {
    let procedimentoLaudoId = body.procedimentoLaudoId;
    if (procedimentoLaudoId) {
      const existing = await this.prisma.pop.findUnique({
        where: { procedimentoLaudoId },
      });
      if (existing) throw new BadRequestException("Procedimento já vinculado a outro POP (relação 1:1)");
    } else {
      const proc = await this.prisma.procedimentoLaudo.create({
        data: {
          estabelecimentoId: user.estabelecimentoId,
          nome: `Proc. ${body.titulo}`,
          tipo: "PREVENTIVA",
          validadeMeses: 12,
          itens: [{ id: "1", pergunta: `Conforme POP ${body.codigo}` }],
        },
      });
      procedimentoLaudoId = proc.id;
    }
    return this.prisma.pop.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        codigo: body.codigo,
        titulo: body.titulo,
        versao: body.versao ?? "1.0",
        procedimentoLaudoId,
      },
      include: { procedimentoLaudo: true },
    });
  }

  listRecomendacoes(estabelecimentoId: string) {
    return this.prisma.recomendacaoInstitucional.findMany({
      where: { estabelecimentoId },
      orderBy: { createdAt: "desc" },
    });
  }
}
