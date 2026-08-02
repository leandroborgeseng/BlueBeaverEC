import { Injectable } from "@nestjs/common";
import { FrequenciaRelatorio } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EstrategicoService } from "../estrategico/estrategico.service";
import { FinanceiroService } from "../financeiro/financeiro.service";
import type { AuthUser } from "../auth/current-user.decorator";

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

  async gerar(estabelecimentoId: string, template: string, formato: "pdf" | "xlsx" | "json" = "json") {
    let payload: unknown;
    switch (template) {
      case "resumo_mensal": {
        const dash = await this.estrategico.dashboardExecutivo(estabelecimentoId);
        payload = {
          template,
          geradoEm: new Date().toISOString(),
          maturidade: dash.indiceMaturidadePct,
          conformidade: dash.indiceConformidadePct,
          disponibilidade: dash.disponibilidadePct,
          riscos: dash.riscosCriticos,
          prioridades: dash.prioridadesMes,
        };
        break;
      }
      case "conformidade":
        payload = {
          template,
          geradoEm: new Date().toISOString(),
          itens: await this.estrategico.centralConformidade(estabelecimentoId),
        };
        break;
      case "custos_manutencao":
        payload = {
          template,
          geradoEm: new Date().toISOString(),
          ...(await this.financeiro.dashboard(estabelecimentoId)),
        };
        break;
      case "maturidade":
        payload = {
          template,
          geradoEm: new Date().toISOString(),
          indice: await this.estrategico.indiceMaturidade(estabelecimentoId),
          dominios: await this.estrategico.listMaturidade(estabelecimentoId),
          recomendacoes: await this.estrategico.listRecomendacoes(estabelecimentoId),
        };
        break;
      default:
        payload = { erro: "Template desconhecido", template };
    }

    if (formato === "xlsx" || formato === "pdf") {
      // MVP: retorna JSON + representação textual exportável (CSV-like) sem libs pesadas
      const texto = typeof payload === "object" ? JSON.stringify(payload, null, 2) : String(payload);
      return {
        formato,
        mime: formato === "xlsx" ? "text/csv" : "text/plain",
        filename: `${template}.${formato === "xlsx" ? "csv" : "txt"}`,
        conteudo: texto,
        dados: payload,
      };
    }
    return { formato: "json", dados: payload };
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
