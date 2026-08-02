import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

export type ReportPayload = Record<string, unknown>;

function templateTitle(codigo: string) {
  const map: Record<string, string> = {
    resumo_mensal: "Resumo Executivo Mensal",
    conformidade: "Conformidade Normativa",
    custos_manutencao: "Custos de Manutenção",
    maturidade: "Maturidade da Engenharia Clínica",
  };
  return map[codigo] ?? codigo;
}

function rowsFromPayload(payload: ReportPayload): Array<{ secao: string; chave: string; valor: string }> {
  const rows: Array<{ secao: string; chave: string; valor: string }> = [];

  const push = (secao: string, chave: string, valor: unknown) => {
    if (valor == null) return;
    if (typeof valor === "object" && !Array.isArray(valor)) {
      for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
        push(secao, `${chave}.${k}`, v);
      }
      return;
    }
    if (Array.isArray(valor)) {
      valor.forEach((item, i) => {
        if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          const label =
            String(o.nome ?? o.codigo ?? o.titulo ?? o.chave ?? o.tag ?? o.numero ?? `#${i + 1}`);
          const bits = Object.entries(o)
            .filter(([k]) => !["id", "estabelecimentoId"].includes(k))
            .slice(0, 8)
            .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}`);
          rows.push({ secao, chave: `${chave}[${label}]`, valor: bits.join(" · ") });
        } else {
          rows.push({ secao, chave: `${chave}[${i}]`, valor: String(item) });
        }
      });
      return;
    }
    rows.push({ secao, chave, valor: String(valor) });
  };

  for (const [k, v] of Object.entries(payload)) {
    if (k === "template" || k === "geradoEm") continue;
    push(k, k, v);
  }
  return rows;
}

export async function buildPdfBuffer(payload: ReportPayload): Promise<Buffer> {
  const codigo = String(payload.template ?? "relatorio");
  const titulo = templateTitle(codigo);
  const geradoEm = String(payload.geradoEm ?? new Date().toISOString());
  const rows = rowsFromPayload(payload);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fillColor("#2f4f9a").fontSize(18).text("Nexo — Engenharia Clínica", { continued: false });
    doc.moveDown(0.3);
    doc.fillColor("#111").fontSize(14).text(titulo);
    doc.fontSize(9).fillColor("#666").text(`Gerado em ${geradoEm}`);
    doc.moveDown();
    doc.strokeColor("#ccc").moveTo(48, doc.y).lineTo(547, doc.y).stroke();
    doc.moveDown();

    let secaoAtual = "";
    for (const row of rows) {
      if (row.secao !== secaoAtual) {
        secaoAtual = row.secao;
        doc.moveDown(0.4);
        doc.fillColor("#2f4f9a").fontSize(11).text(secaoAtual.toUpperCase());
        doc.moveDown(0.2);
      }
      doc.fillColor("#222").fontSize(9).text(`${row.chave}: ${row.valor}`, {
        width: 500,
        align: "left",
      });
    }

    if (rows.length === 0) {
      doc.fillColor("#666").fontSize(10).text("Sem dados para o período.");
    }

    doc.end();
  });
}

export async function buildXlsxBuffer(payload: ReportPayload): Promise<Buffer> {
  const codigo = String(payload.template ?? "relatorio");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Nexo";
  workbook.created = new Date();

  const meta = workbook.addWorksheet("Resumo");
  meta.columns = [
    { header: "Campo", key: "campo", width: 28 },
    { header: "Valor", key: "valor", width: 60 },
  ];
  meta.addRow({ campo: "Template", valor: templateTitle(codigo) });
  meta.addRow({ campo: "Código", valor: codigo });
  meta.addRow({ campo: "Gerado em", valor: String(payload.geradoEm ?? "") });
  meta.getRow(1).font = { bold: true };

  const detalhe = workbook.addWorksheet("Dados");
  detalhe.columns = [
    { header: "Seção", key: "secao", width: 22 },
    { header: "Chave", key: "chave", width: 36 },
    { header: "Valor", key: "valor", width: 80 },
  ];
  detalhe.getRow(1).font = { bold: true };
  for (const row of rowsFromPayload(payload)) {
    detalhe.addRow(row);
  }

  // Planilhas específicas quando existirem arrays conhecidos
  if (Array.isArray(payload.itens)) {
    const ws = workbook.addWorksheet("Itens");
    const itens = payload.itens as Array<Record<string, unknown>>;
    const keys = Array.from(
      new Set(itens.flatMap((i) => Object.keys(i).filter((k) => typeof i[k] !== "object"))),
    ).slice(0, 12);
    ws.columns = keys.map((k) => ({ header: k, key: k, width: 18 }));
    ws.getRow(1).font = { bold: true };
    for (const item of itens) {
      const row: Record<string, unknown> = {};
      for (const k of keys) row[k] = item[k];
      // flatten nested evidencia/status
      if (item.status != null) row.status = item.status;
      ws.addRow(row);
    }
  }

  if (Array.isArray(payload.breakdown)) {
    const ws = workbook.addWorksheet("Breakdown");
    ws.columns = [
      { header: "Chave", key: "chave", width: 28 },
      { header: "Total", key: "total", width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const b of payload.breakdown as Array<{ chave: string; total: number }>) {
      ws.addRow(b);
    }
  }

  if (Array.isArray(payload.dominios)) {
    const ws = workbook.addWorksheet("Dominios");
    ws.columns = [
      { header: "Código", key: "codigo", width: 14 },
      { header: "Nome", key: "nome", width: 28 },
      { header: "Nível", key: "nivel", width: 10 },
      { header: "Peso", key: "peso", width: 10 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const d of payload.dominios as Array<{
      codigo: string;
      nome: string;
      peso: number;
      avaliacao?: { nivel: number } | null;
    }>) {
      ws.addRow({
        codigo: d.codigo,
        nome: d.nome,
        nivel: d.avaliacao?.nivel ?? "",
        peso: d.peso,
      });
    }
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
