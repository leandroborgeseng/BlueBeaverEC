import { BadRequestException, Injectable } from "@nestjs/common";
import { FrequenciaRelatorio } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EstrategicoService } from "../estrategico/estrategico.service";
import { FinanceiroService } from "../financeiro/financeiro.service";
import type { AuthUser } from "../auth/current-user.decorator";
import { buildPdfBuffer, buildXlsxBuffer, type ReportPayload } from "./report-export";

const TEMPLATES = [
  {
    codigo: "resumo_mensal",
    nome: "Resumo Executivo Mensal",
    descricao: "KPIs operacionais, OS e disponibilidade do período",
  },
  {
    codigo: "conformidade",
    nome: "Conformidade Normativa",
    descricao: "Status de requisitos e evidências",
  },
  {
    codigo: "custos_manutencao",
    nome: "Custos de Manutenção",
    descricao: "Extrato agregado de custos derivados",
  },
  {
    codigo: "maturidade",
    nome: "Maturidade da Engenharia Clínica",
    descricao: "Índice e evolução por domínio",
  },
] as const;

@Injectable()
export class RelatoriosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly estrategico: EstrategicoService,
    private readonly financeiro: FinanceiroService,
  ) {}

  templates() {
    return TEMPLATES;
  }

  async buildPayload(estabelecimentoId: string, template: string): Promise<ReportPayload> {
    switch (template) {
      case "resumo_mensal": {
        const dash = await this.estrategico.dashboardExecutivo(estabelecimentoId);
        return {
          template,
          geradoEm: new Date().toISOString(),
          maturidade: dash.indiceMaturidadePct,
          conformidade: dash.indiceConformidadePct,
          disponibilidade: dash.disponibilidadePct,
          riscos: dash.riscosCriticos,
          prioridades: dash.prioridadesMes,
          recomendacoes: dash.recomendacoes,
          contratosVencendo: dash.contratosVencendo,
        };
      }
      case "conformidade":
        return {
          template,
          geradoEm: new Date().toISOString(),
          itens: await this.estrategico.centralConformidade(estabelecimentoId),
        };
      case "custos_manutencao":
        return {
          template,
          geradoEm: new Date().toISOString(),
          ...(await this.financeiro.dashboard(estabelecimentoId)),
        };
      case "maturidade":
        return {
          template,
          geradoEm: new Date().toISOString(),
          indice: await this.estrategico.indiceMaturidade(estabelecimentoId),
          dominios: await this.estrategico.listMaturidade(estabelecimentoId),
          recomendacoes: await this.estrategico.listRecomendacoes(estabelecimentoId),
        };
      default:
        throw new BadRequestException(`Template desconhecido: ${template}`);
    }
  }

  async gerar(estabelecimentoId: string, template: string, formato: "pdf" | "xlsx" | "json" = "json") {
    const payload = await this.buildPayload(estabelecimentoId, template);

    if (formato === "json") {
      return { formato: "json" as const, dados: payload };
    }

    if (formato === "pdf") {
      const buffer = await buildPdfBuffer(payload);
      return {
        formato: "pdf" as const,
        mime: "application/pdf",
        filename: `${template}.pdf`,
        buffer,
      };
    }

    const buffer = await buildXlsxBuffer(payload);
    return {
      formato: "xlsx" as const,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: `${template}.xlsx`,
      buffer,
    };
  }

  listAgendamentos(estabelecimentoId: string) {
    return this.prisma.relatorioAgendamento.findMany({
      where: { estabelecimentoId },
      orderBy: { createdAt: "desc" },
    });
  }

  createAgendamento(
    user: AuthUser,
    body: { template: string; frequencia: FrequenciaRelatorio; destinatarios: string[] },
  ) {
    const proximo = new Date();
    if (body.frequencia === FrequenciaRelatorio.SEMANAL) proximo.setDate(proximo.getDate() + 7);
    else if (body.frequencia === FrequenciaRelatorio.TRIMESTRAL) proximo.setMonth(proximo.getMonth() + 3);
    else proximo.setMonth(proximo.getMonth() + 1);

    return this.prisma.relatorioAgendamento.create({
      data: {
        estabelecimentoId: user.estabelecimentoId,
        template: body.template,
        frequencia: body.frequencia,
        destinatarios: body.destinatarios,
        proximoEnvio: proximo,
      },
    });
  }
}
