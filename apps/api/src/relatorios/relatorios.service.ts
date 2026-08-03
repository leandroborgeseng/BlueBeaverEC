import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FrequenciaRelatorio } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EstrategicoService } from "../estrategico/estrategico.service";
import { FinanceiroService } from "../financeiro/financeiro.service";
import { PlanosService } from "../planos/planos.service";
import { EquipamentosService } from "../equipamentos/equipamentos.service";
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
  {
    codigo: "calendario_manutencao",
    nome: "Calendário de Manutenção",
    descricao: "Agenda anual / mensal / semanal de preventiva, TSE e calibração (exportável)",
  },
  {
    codigo: "inventario_equipamentos",
    nome: "Inventário de Equipamentos",
    descricao: "Lista atual do parque (PDF/XLSX), excluindo arquivados",
  },
] as const;

@Injectable()
export class RelatoriosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly estrategico: EstrategicoService,
    private readonly financeiro: FinanceiroService,
    private readonly planos: PlanosService,
    private readonly equipamentos: EquipamentosService,
  ) {}

  templates() {
    return TEMPLATES;
  }

  async buildPayload(
    estabelecimentoId: string,
    template: string,
    opts: { de?: string; ate?: string } = {},
  ): Promise<ReportPayload> {
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
      case "calendario_manutencao": {
        const cal = await this.planos.calendario(estabelecimentoId, {
          de: opts.de,
          ate: opts.ate,
        });
        return {
          template,
          geradoEm: new Date().toISOString(),
          ...cal,
        };
      }
      case "inventario_equipamentos": {
        const inv = await this.equipamentos.inventarioAtual(estabelecimentoId);
        return {
          template,
          geradoEm: new Date().toISOString(),
          ...inv,
        };
      }
      default:
        throw new BadRequestException(`Template desconhecido: ${template}`);
    }
  }

  async gerar(
    estabelecimentoId: string,
    template: string,
    formato: "pdf" | "xlsx" | "json" = "json",
    opts: { de?: string; ate?: string } = {},
  ) {
    const payload = await this.buildPayload(estabelecimentoId, template, opts);

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

  async listAgendamentos(estabelecimentoId: string) {
    const rows = await this.prisma.relatorioAgendamento.findMany({
      where: { estabelecimentoId },
      orderBy: { createdAt: "desc" },
    });

    const logs = await this.prisma.logAcesso.findMany({
      where: {
        acao: "RELATORIO_EMAIL_ENVIADO",
        detalhe: { contains: estabelecimentoId },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return rows.map((r) => {
      const last = logs.find((l) => l.detalhe?.includes(r.id));
      return {
        ...r,
        ultimoEnvio: last?.createdAt ?? null,
        ultimoStatus: last ? "ENVIADO_STUB" : null,
      };
    });
  }

  createAgendamento(
    user: AuthUser,
    body: { template: string; frequencia: FrequenciaRelatorio; destinatarios: string[] },
  ) {
    if (!TEMPLATES.some((t) => t.codigo === body.template)) {
      throw new BadRequestException(`Template inválido: ${body.template}`);
    }
    const proximo = this.nextDate(body.frequencia, new Date());

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

  private nextDate(freq: FrequenciaRelatorio, from: Date) {
    const proximo = new Date(from);
    if (freq === FrequenciaRelatorio.SEMANAL) proximo.setDate(proximo.getDate() + 7);
    else if (freq === FrequenciaRelatorio.TRIMESTRAL) proximo.setMonth(proximo.getMonth() + 3);
    else proximo.setMonth(proximo.getMonth() + 1);
    return proximo;
  }

  /**
   * Stub de envio por e-mail: gera o relatório, registra log e avança próximoEnvio.
   * Sem SMTP — pronto para plugar provedor depois.
   */
  async disparar(user: AuthUser, id: string) {
    const ag = await this.prisma.relatorioAgendamento.findFirst({
      where: { id, estabelecimentoId: user.estabelecimentoId, ativo: true },
    });
    if (!ag) throw new NotFoundException("Agendamento não encontrado");

    const out = await this.gerar(user.estabelecimentoId, ag.template, "pdf");
    const size = out.formato === "pdf" ? out.buffer.length : 0;
    const agora = new Date();

    await this.prisma.logAcesso.create({
      data: {
        usuarioId: user.userId,
        acao: "RELATORIO_EMAIL_ENVIADO",
        detalhe: `${user.estabelecimentoId} · ag=${ag.id} · ${ag.template} → ${ag.destinatarios.join(", ")} · ${size}b · stub`,
      },
    });

    await this.prisma.relatorioAgendamento.update({
      where: { id: ag.id },
      data: { proximoEnvio: this.nextDate(ag.frequencia, agora) },
    });

    return {
      enviado: true,
      stub: true,
      template: ag.template,
      destinatarios: ag.destinatarios,
      bytes: size,
      mensagem: `E-mail simulado para ${ag.destinatarios.length} destinatário(s)`,
    };
  }

  async dispararPendentes(user: AuthUser) {
    const agora = new Date();
    const pendentes = await this.prisma.relatorioAgendamento.findMany({
      where: {
        estabelecimentoId: user.estabelecimentoId,
        ativo: true,
        OR: [{ proximoEnvio: null }, { proximoEnvio: { lte: agora } }],
      },
    });

    const resultados = [];
    for (const p of pendentes) {
      resultados.push(await this.disparar(user, p.id));
    }
    return { processados: resultados.length, resultados };
  }
}
