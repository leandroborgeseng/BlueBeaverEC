import { Injectable } from "@nestjs/common";
import { TipoItemOS } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type LancamentoTipo = "MATERIAL" | "MAO_DE_OBRA" | "RATEIO" | "GLOSA";

@Injectable()
export class FinanceiroService {
  constructor(private readonly prisma: PrismaService) {}

  async extrato(
    estabelecimentoId: string,
    filtros: { tipo?: LancamentoTipo; de?: string; ate?: string; equipamentoTag?: string } = {},
  ) {
    const de = filtros.de ? new Date(filtros.de) : new Date(0);
    const ate = filtros.ate ? new Date(filtros.ate) : new Date();
    ate.setHours(23, 59, 59, 999);

    const itens = await this.prisma.ordemServicoItem.findMany({
      where: {
        ordemServico: {
          estabelecimentoId,
          abertura: { gte: de, lte: ate },
          ...(filtros.equipamentoTag
            ? { equipamento: { tag: filtros.equipamentoTag } }
            : {}),
        },
        ...(filtros.tipo === "MATERIAL" || filtros.tipo === "MAO_DE_OBRA"
          ? { tipo: filtros.tipo as TipoItemOS }
          : {}),
      },
      include: {
        ordemServico: { include: { equipamento: { include: { setor: true, centroCusto: true } } } },
      },
      orderBy: { id: "desc" },
    });

    const lancamentos: Array<{
      tipo: LancamentoTipo;
      data: Date;
      descricao: string;
      valor: number;
      equipamentoTag?: string;
      setor?: string;
      centroCusto?: string;
      origem: string;
    }> = [];

    if (!filtros.tipo || filtros.tipo === "MATERIAL" || filtros.tipo === "MAO_DE_OBRA") {
      for (const i of itens) {
        if (filtros.tipo && i.tipo !== filtros.tipo) continue;
        const valor = Number(i.quantidade) * Number(i.valorUnitario ?? 0);
        lancamentos.push({
          tipo: i.tipo as LancamentoTipo,
          data: i.ordemServico.abertura,
          descricao: i.descricao,
          valor,
          equipamentoTag: i.ordemServico.equipamento.tag,
          setor: i.ordemServico.equipamento.setor?.nome,
          centroCusto: i.ordemServico.equipamento.centroCusto?.nome,
          origem: `OS-${i.ordemServico.numero}`,
        });
      }
    }

    if (!filtros.tipo || filtros.tipo === "RATEIO" || filtros.tipo === "GLOSA") {
      const contratos = await this.prisma.contrato.findMany({
        where: { estabelecimentoId },
        include: {
          equipamentos: { include: { equipamento: { include: { setor: true, centroCusto: true } } } },
          glosas: true,
          fornecedor: true,
        },
      });
      for (const c of contratos) {
        const n = c.equipamentos.length || 1;
        const rateio = Number(c.valor) / n;
        if (!filtros.tipo || filtros.tipo === "RATEIO") {
          if (c.vigenciaInicio <= ate && c.vigenciaFim >= de) {
            for (const ce of c.equipamentos) {
              if (filtros.equipamentoTag && ce.equipamento.tag !== filtros.equipamentoTag) continue;
              lancamentos.push({
                tipo: "RATEIO",
                data: c.vigenciaInicio,
                descricao: `Rateio contrato ${c.numero} — ${c.fornecedor.nome}`,
                valor: Number(rateio.toFixed(2)),
                equipamentoTag: ce.equipamento.tag,
                setor: ce.equipamento.setor?.nome,
                centroCusto: ce.equipamento.centroCusto?.nome,
                origem: c.numero,
              });
            }
          }
        }
        if (!filtros.tipo || filtros.tipo === "GLOSA") {
          for (const g of c.glosas) {
            if (g.data < de || g.data > ate) continue;
            lancamentos.push({
              tipo: "GLOSA",
              data: g.data,
              descricao: `Glosa ${c.numero}: ${g.motivo}`,
              valor: -Number(g.valor),
              origem: c.numero,
            });
          }
        }
      }
    }

    lancamentos.sort((a, b) => b.data.getTime() - a.data.getTime());
    return lancamentos;
  }

  async dashboard(
    estabelecimentoId: string,
    agrupar: "equipamento" | "setor" | "centroCusto" = "equipamento",
  ) {
    const extrato = await this.extrato(estabelecimentoId);
    const map = new Map<string, number>();
    for (const l of extrato) {
      const key =
        agrupar === "setor"
          ? l.setor || "Sem setor"
          : agrupar === "centroCusto"
            ? l.centroCusto || "Sem CC"
            : l.equipamentoTag || "Sem TAG";
      map.set(key, (map.get(key) ?? 0) + l.valor);
    }
    const breakdown = [...map.entries()]
      .map(([chave, total]) => ({ chave, total: Number(total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
    const totalGeral = breakdown.reduce((s, b) => s + b.total, 0);
    const porTipo = { MATERIAL: 0, MAO_DE_OBRA: 0, RATEIO: 0, GLOSA: 0 };
    for (const l of extrato) porTipo[l.tipo] += l.valor;
    return {
      totalGeral: Number(totalGeral.toFixed(2)),
      porTipo,
      breakdown,
      agrupar,
    };
  }

  async exportCsv(estabelecimentoId: string) {
    const rows = await this.extrato(estabelecimentoId);
    const header = "tipo,data,descricao,valor,equipamento,setor,centroCusto,origem";
    const lines = rows.map((r) =>
      [
        r.tipo,
        r.data.toISOString().slice(0, 10),
        `"${r.descricao.replace(/"/g, '""')}"`,
        r.valor,
        r.equipamentoTag ?? "",
        r.setor ?? "",
        r.centroCusto ?? "",
        r.origem,
      ].join(","),
    );
    return [header, ...lines].join("\n");
  }

  async exportXlsx(estabelecimentoId: string) {
    const ExcelJS = (await import("exceljs")).default;
    const rows = await this.extrato(estabelecimentoId);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Extrato");
    ws.columns = [
      { header: "Tipo", key: "tipo", width: 14 },
      { header: "Data", key: "data", width: 12 },
      { header: "Descrição", key: "descricao", width: 48 },
      { header: "Valor", key: "valor", width: 14 },
      { header: "Equipamento", key: "equipamentoTag", width: 14 },
      { header: "Setor", key: "setor", width: 18 },
      { header: "Centro de Custo", key: "centroCusto", width: 18 },
      { header: "Origem", key: "origem", width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const r of rows) {
      ws.addRow({
        tipo: r.tipo,
        data: r.data.toISOString().slice(0, 10),
        descricao: r.descricao,
        valor: r.valor,
        equipamentoTag: r.equipamentoTag ?? "",
        setor: r.setor ?? "",
        centroCusto: r.centroCusto ?? "",
        origem: r.origem,
      });
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
