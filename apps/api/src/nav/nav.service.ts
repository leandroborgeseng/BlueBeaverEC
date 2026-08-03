import { Injectable } from "@nestjs/common";
import { StatusNC, StatusOS, TipoLaudo } from "@prisma/client";
import { SLA_HORAS, type PrioridadeOS as PrioridadeShared } from "@nexo/shared";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/current-user.decorator";

@Injectable()
export class NavService {
  constructor(private readonly prisma: PrismaService) {}

  async busca(estabelecimentoId: string, q: string) {
    const term = q.trim();
    if (term.length < 2) {
      return { equipamentos: [], os: [], contratos: [] };
    }

    const [equipamentos, os, contratos] = await Promise.all([
      this.prisma.equipamento.findMany({
        where: {
          estabelecimentoId,
          OR: [
            { tag: { contains: term, mode: "insensitive" } },
            { nome: { contains: term, mode: "insensitive" } },
            { patrimonio: { contains: term, mode: "insensitive" } },
          ],
        },
        select: { tag: true, nome: true, situacao: true, setor: { select: { nome: true } } },
        take: 8,
      }),
      this.prisma.ordemServico.findMany({
        where: {
          estabelecimentoId,
          OR: [
            { codigo: { contains: term, mode: "insensitive" } },
            { equipamento: { tag: { contains: term, mode: "insensitive" } } },
            { equipamento: { nome: { contains: term, mode: "insensitive" } } },
          ],
        },
        select: {
          numero: true,
          codigo: true,
          status: true,
          prioridade: true,
          equipamento: { select: { tag: true, nome: true } },
        },
        take: 8,
      }),
      this.prisma.contrato.findMany({
        where: {
          estabelecimentoId,
          OR: [
            { numero: { contains: term, mode: "insensitive" } },
            { descricao: { contains: term, mode: "insensitive" } },
            { fornecedor: { nome: { contains: term, mode: "insensitive" } } },
          ],
        },
        select: {
          numero: true,
          descricao: true,
          vigenciaFim: true,
          fornecedor: { select: { nome: true } },
        },
        take: 8,
      }),
    ]);

    return { equipamentos, os, contratos };
  }

  /** Auto-escalona planos vencidos e devolve notificações computadas. */
  async notificacoes(user: AuthUser) {
    await this.autoEscalonarNc(user.estabelecimentoId);

    const estabId = user.estabelecimentoId;
    const agora = Date.now();
    const items: Array<{
      id: string;
      tipo: string;
      titulo: string;
      detalhe: string;
      href: string;
      severidade: "info" | "warning" | "danger";
      createdAt: string;
    }> = [];

    const osAbertas = await this.prisma.ordemServico.findMany({
      where: {
        estabelecimentoId: estabId,
        status: { in: [StatusOS.NAO_ATRIBUIDA, StatusOS.ABERTA, StatusOS.EM_ANDAMENTO] },
      },
      include: { equipamento: { select: { tag: true } } },
      take: 100,
    });

    for (const os of osAbertas) {
      const horas = SLA_HORAS[os.prioridade as PrioridadeShared] ?? 72;
      const limite = os.abertura.getTime() + horas * 60 * 60 * 1000;
      if (agora > limite) {
        items.push({
          id: `os-atrasada-${os.numero}`,
          tipo: "OS_ATRASADA",
          titulo: `${os.codigo ?? `OS-${os.numero}`} atrasada`,
          detalhe: `${os.equipamento.tag} · prioridade ${os.prioridade}`,
          href: "/os",
          severidade: "danger",
          createdAt: os.abertura.toISOString(),
        });
      }
    }

    const limiteContrato = new Date();
    limiteContrato.setDate(limiteContrato.getDate() + 30);
    const contratos = await this.prisma.contrato.findMany({
      where: {
        estabelecimentoId: estabId,
        vigenciaFim: { lte: limiteContrato, gte: new Date() },
      },
      include: { fornecedor: true },
      orderBy: { vigenciaFim: "asc" },
      take: 20,
    });
    for (const c of contratos) {
      const dias = Math.ceil((c.vigenciaFim.getTime() - agora) / (1000 * 60 * 60 * 24));
      items.push({
        id: `contrato-${c.id}`,
        tipo: "CONTRATO_VENCENDO",
        titulo: `Contrato ${c.numero} vence em ${dias}d`,
        detalhe: c.fornecedor.nome,
        href: "/contratos",
        severidade: dias <= 15 ? "danger" : "warning",
        createdAt: c.vigenciaFim.toISOString(),
      });
    }

    const limiteReajuste = new Date();
    limiteReajuste.setDate(limiteReajuste.getDate() + 30);
    const reajustes = await this.prisma.contrato.findMany({
      where: {
        estabelecimentoId: estabId,
        dataReajusteAniversario: { not: null, lte: limiteReajuste, gte: new Date(agora - 7 * 86400000) },
      },
      include: { fornecedor: true },
      take: 20,
    });
    for (const c of reajustes) {
      if (!c.dataReajusteAniversario) continue;
      const dias = Math.ceil((c.dataReajusteAniversario.getTime() - agora) / (1000 * 60 * 60 * 24));
      items.push({
        id: `reajuste-${c.id}`,
        tipo: "CONTRATO_REAJUSTE",
        titulo:
          dias < 0
            ? `Reajuste ${c.indiceReajuste ?? ""} de ${c.numero} vencido`
            : `Reajuste ${c.indiceReajuste ?? ""} de ${c.numero} em ${dias}d`,
        detalhe: c.fornecedor.nome,
        href: "/contratos",
        severidade: dias <= 7 ? "danger" : "warning",
        createdAt: c.dataReajusteAniversario.toISOString(),
      });
    }

    const limiteCert = new Date();
    limiteCert.setDate(limiteCert.getDate() + 60);
    const laudos = await this.prisma.laudo.findMany({
      where: {
        estabelecimentoId: estabId,
        validadeAte: { not: null, lte: limiteCert },
        tipo: { in: [TipoLaudo.CALIBRACAO, TipoLaudo.TSE] },
      },
      include: { equipamento: { select: { tag: true } } },
      orderBy: { validadeAte: "asc" },
      take: 30,
    });
    for (const l of laudos) {
      if (!l.validadeAte) continue;
      const dias = Math.ceil((l.validadeAte.getTime() - agora) / (1000 * 60 * 60 * 24));
      const vencido = dias < 0;
      items.push({
        id: `cert-${l.id}`,
        tipo: vencido ? "CERTIFICADO_VENCIDO" : "CERTIFICADO_A_VENCER",
        titulo: vencido
          ? `Certificado vencido · ${l.equipamento.tag}`
          : `Certificado a vencer (${dias}d) · ${l.equipamento.tag}`,
        detalhe: l.tipo,
        href: "/certificados",
        severidade: vencido ? "danger" : "warning",
        createdAt: l.validadeAte.toISOString(),
      });
    }

    const planosEscalonados = await this.prisma.planoAcao.findMany({
      where: {
        escalonadoEm: { not: null },
        concluidoEm: null,
        naoConformidade: {
          estabelecimentoId: estabId,
          status: { not: StatusNC.FECHADA },
        },
      },
      include: { naoConformidade: true },
      orderBy: { escalonadoEm: "desc" },
      take: 20,
    });
    for (const p of planosEscalonados) {
      items.push({
        id: `nc-esc-${p.id}`,
        tipo: "NC_ESCALONADA",
        titulo: `NC escalonada · ${p.naoConformidade.codigo}`,
        detalhe: p.descricao.slice(0, 120),
        href: "/auditorias",
        severidade: "danger",
        createdAt: (p.escalonadoEm ?? p.createdAt).toISOString(),
      });
    }

    items.sort((a, b) => {
      const rank = { danger: 0, warning: 1, info: 2 };
      return rank[a.severidade] - rank[b.severidade];
    });

    return { items: items.slice(0, 40), unread: items.length };
  }

  private async autoEscalonarNc(estabelecimentoId: string) {
    const agora = new Date();
    const vencidos = await this.prisma.planoAcao.findMany({
      where: {
        concluidoEm: null,
        prazo: { lt: agora },
        escalonadoEm: null,
        naoConformidade: { estabelecimentoId },
      },
      include: { naoConformidade: true },
    });

    for (const p of vencidos) {
      await this.prisma.planoAcao.update({
        where: { id: p.id },
        data: { escalonadoEm: agora },
      });
      await this.prisma.logAcesso.create({
        data: {
          acao: "ESCALONAMENTO_PLANO_ACAO",
          detalhe: `${estabelecimentoId} · ${p.naoConformidade.codigo} · plano ${p.id} · notificar gestor`,
        },
      });
    }
  }

  async recentes(estabelecimentoId: string) {
    const [os, equips] = await Promise.all([
      this.prisma.ordemServico.findMany({
        where: { estabelecimentoId },
        orderBy: { abertura: "desc" },
        take: 5,
        select: { numero: true, codigo: true, equipamento: { select: { tag: true } } },
      }),
      this.prisma.equipamento.findMany({
        where: { estabelecimentoId },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { tag: true, nome: true },
      }),
    ]);
    return [
      ...os.map((o) => ({
        id: `os-${o.numero}`,
        label: o.codigo ?? `OS-${o.numero}`,
        hint: o.equipamento.tag,
        href: "/os",
        kind: "os" as const,
        payload: { numero: o.numero, codigo: o.codigo },
      })),
      ...equips.map((e) => ({
        id: `eq-${e.tag}`,
        label: e.tag,
        hint: e.nome,
        href: "/equipamentos",
        kind: "equipamento" as const,
        payload: { tag: e.tag },
      })),
    ].slice(0, 8);
  }
}
