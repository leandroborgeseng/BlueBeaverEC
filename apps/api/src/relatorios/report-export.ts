import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

export type ReportPayload = Record<string, unknown>;

function templateTitle(codigo: string) {
  const map: Record<string, string> = {
    resumo_mensal: "Resumo Executivo Mensal",
    conformidade: "Conformidade Normativa",
    custos_manutencao: "Custos de Manutenção",
    maturidade: "Maturidade da Engenharia Clínica",
    calendario_manutencao: "Calendário de Manutenção",
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
  if (codigo === "calendario_manutencao") {
    return buildCalendarioPdf(payload);
  }

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

type CalEventoPdf = {
  abertura?: string;
  semana?: string;
  mes?: string;
  codigo?: string;
  tipo?: string;
  status?: string;
  tag?: string;
  equipamento?: string;
  setor?: string;
};

function ensureSpace(doc: PDFKit.PDFDocument, needed: number, drawHeader: () => void) {
  if (doc.y + needed > doc.page.height - 48) {
    doc.addPage();
    drawHeader();
  }
}

function buildCalendarioPdf(payload: ReportPayload): Promise<Buffer> {
  const geradoEm = String(payload.geradoEm ?? new Date().toISOString());
  const de = String(payload.de ?? "");
  const ate = String(payload.ate ?? "");
  const total = Number(payload.total ?? 0);
  const porTipo = (payload.porTipo ?? {}) as Record<string, number>;
  const anual = (Array.isArray(payload.anual) ? payload.anual : []) as Array<{
    label: string;
    total: number;
    porTipo: Record<string, number>;
  }>;
  const porSemana = (payload.porSemana ?? {}) as Record<string, number>;
  const porMes = (payload.porMes ?? {}) as Record<string, number>;
  const eventos = (Array.isArray(payload.eventos) ? payload.eventos : []) as CalEventoPdf[];

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width - 80;

    const drawHeader = () => {
      doc.fillColor("#2f4f9a").fontSize(16).text("Nexo — Engenharia Clínica", 40, 36, { width: pageW });
      doc.fillColor("#111").fontSize(12).text("Calendário de Manutenção (Preventiva · TSE · Calibração)", {
        width: pageW,
      });
      doc
        .fontSize(8)
        .fillColor("#666")
        .text(`Período ${de} a ${ate} · ${total} OS · Gerado em ${geradoEm}`, { width: pageW });
      doc.moveDown(0.4);
      doc.strokeColor("#ccc").moveTo(40, doc.y).lineTo(40 + pageW, doc.y).stroke();
      doc.moveDown(0.5);
    };

    drawHeader();

    doc.fillColor("#2f4f9a").fontSize(10).text("Resumo por tipo");
    doc.moveDown(0.3);
    doc.fillColor("#222").fontSize(9);
    const tiposLine = ["PREVENTIVA", "CALIBRACAO", "TSE", "QUALIFICACAO"]
      .map((t) => `${t}: ${porTipo[t] ?? 0}`)
      .join("   ·   ");
    doc.text(tiposLine || "Sem OS no período.");
    doc.moveDown(0.8);

    // Visão anual
    ensureSpace(doc, 120, drawHeader);
    doc.fillColor("#2f4f9a").fontSize(10).text("Visão anual (por mês)");
    doc.moveDown(0.3);

    const colW = [48, 48, 70, 70, 48, 70];
    const headers = ["Mês", "Total", "Preventiva", "Calibração", "TSE", "Qualif."];
    {
      const y = doc.y;
      let cx = 40;
      doc.fontSize(8).fillColor("#444");
      headers.forEach((h, i) => {
        doc.text(h, cx, y, { width: colW[i], lineBreak: false });
        cx += colW[i];
      });
      doc.y = y + 12;
    }
    doc.strokeColor("#ddd").moveTo(40, doc.y).lineTo(40 + colW.reduce((a, b) => a + b, 0), doc.y).stroke();
    doc.moveDown(0.2);

    for (const m of anual) {
      ensureSpace(doc, 14, drawHeader);
      const y = doc.y;
      const vals = [
        m.label,
        String(m.total),
        String(m.porTipo?.PREVENTIVA ?? 0),
        String(m.porTipo?.CALIBRACAO ?? 0),
        String(m.porTipo?.TSE ?? 0),
        String(m.porTipo?.QUALIFICACAO ?? 0),
      ];
      let cx = 40;
      doc.fillColor("#222").fontSize(8);
      vals.forEach((v, i) => {
        doc.text(v, cx, y, { width: colW[i], lineBreak: false });
        cx += colW[i];
      });
      doc.y = y + 12;
    }

    doc.moveDown(0.8);

    // Mensal compacto
    const meses = Object.entries(porMes).sort(([a], [b]) => a.localeCompare(b));
    if (meses.length) {
      ensureSpace(doc, 40, drawHeader);
      doc.fillColor("#2f4f9a").fontSize(10).text("Resumo mensal");
      doc.moveDown(0.3);
      doc.fillColor("#222").fontSize(8);
      doc.text(meses.map(([m, n]) => `${m}: ${n}`).join("  ·  "), { width: pageW });
      doc.moveDown(0.6);
    }

    // Semanal compacto
    const semanas = Object.entries(porSemana).sort(([a], [b]) => a.localeCompare(b));
    if (semanas.length) {
      ensureSpace(doc, 40, drawHeader);
      doc.fillColor("#2f4f9a").fontSize(10).text("Resumo semanal (ISO)");
      doc.moveDown(0.3);
      doc.fillColor("#222").fontSize(8);
      doc.text(semanas.map(([s, n]) => `${s}: ${n}`).join("  ·  "), { width: pageW });
      doc.moveDown(0.8);
    }

    // Agenda
    doc.addPage();
    drawHeader();
    doc.fillColor("#2f4f9a").fontSize(10).text(`Agenda detalhada (${eventos.length} OS)`);
    doc.moveDown(0.4);

    const agendaCols = [
      { key: "abertura", label: "Data", w: 58 },
      { key: "semana", label: "Semana", w: 58 },
      { key: "codigo", label: "OS", w: 58 },
      { key: "tipo", label: "Tipo", w: 72 },
      { key: "tag", label: "TAG", w: 70 },
      { key: "equipamento", label: "Equipamento", w: 160 },
      { key: "setor", label: "Setor", w: 110 },
      { key: "status", label: "Status", w: 70 },
    ] as const;

    const drawAgendaHeader = () => {
      let hx = 40;
      const hy = doc.y;
      doc.fontSize(7).fillColor("#444");
      for (const c of agendaCols) {
        doc.text(c.label, hx, hy, { width: c.w, lineBreak: false });
        hx += c.w;
      }
      doc.y = hy + 11;
      doc.strokeColor("#bbb").moveTo(40, doc.y).lineTo(40 + pageW, doc.y).stroke();
      doc.moveDown(0.25);
    };

    drawAgendaHeader();

    if (eventos.length === 0) {
      doc.fillColor("#666").fontSize(9).text("Nenhuma OS de plano no período.");
    } else {
      for (const e of eventos) {
        ensureSpace(doc, 14, () => {
          drawHeader();
          doc.fillColor("#2f4f9a").fontSize(10).text("Agenda detalhada (cont.)");
          doc.moveDown(0.3);
          drawAgendaHeader();
        });
        const y = doc.y;
        let cx = 40;
        doc.fillColor("#222").fontSize(7);
        for (const c of agendaCols) {
          const val = String(e[c.key] ?? "").slice(0, c.key === "equipamento" ? 42 : 18);
          doc.text(val, cx, y, { width: c.w, lineBreak: false });
          cx += c.w;
        }
        doc.y = y + 11;
      }
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

  if (Array.isArray(payload.eventos)) {
    const agenda = workbook.addWorksheet("Agenda");
    agenda.columns = [
      { header: "Data", key: "abertura", width: 12 },
      { header: "Semana", key: "semana", width: 10 },
      { header: "Mês", key: "mes", width: 10 },
      { header: "OS", key: "codigo", width: 12 },
      { header: "Tipo", key: "tipo", width: 14 },
      { header: "Status", key: "status", width: 14 },
      { header: "TAG", key: "tag", width: 14 },
      { header: "Equipamento", key: "equipamento", width: 28 },
      { header: "Setor", key: "setor", width: 22 },
      { header: "Pendência", key: "pendencia", width: 36 },
    ];
    agenda.getRow(1).font = { bold: true };
    for (const e of payload.eventos as Array<Record<string, unknown>>) {
      agenda.addRow(e);
    }

    if (Array.isArray(payload.anual)) {
      const anual = workbook.addWorksheet("Anual");
      anual.columns = [
        { header: "Mês", key: "label", width: 10 },
        { header: "Total", key: "total", width: 10 },
        { header: "Preventiva", key: "prev", width: 12 },
        { header: "Calibração", key: "cal", width: 12 },
        { header: "TSE", key: "tse", width: 10 },
        { header: "Qualificação", key: "qlf", width: 12 },
      ];
      anual.getRow(1).font = { bold: true };
      for (const m of payload.anual as Array<{
        label: string;
        total: number;
        porTipo: Record<string, number>;
      }>) {
        anual.addRow({
          label: m.label,
          total: m.total,
          prev: m.porTipo.PREVENTIVA ?? 0,
          cal: m.porTipo.CALIBRACAO ?? 0,
          tse: m.porTipo.TSE ?? 0,
          qlf: m.porTipo.QUALIFICACAO ?? 0,
        });
      }
    }

    if (payload.porSemana && typeof payload.porSemana === "object") {
      const sem = workbook.addWorksheet("Semanal");
      sem.columns = [
        { header: "Semana ISO", key: "semana", width: 12 },
        { header: "Total OS", key: "total", width: 10 },
      ];
      sem.getRow(1).font = { bold: true };
      for (const [semana, total] of Object.entries(payload.porSemana as Record<string, number>).sort()) {
        sem.addRow({ semana, total });
      }
    }

    if (payload.porMes && typeof payload.porMes === "object") {
      const mensal = workbook.addWorksheet("Mensal");
      mensal.columns = [
        { header: "Mês", key: "mes", width: 12 },
        { header: "Total OS", key: "total", width: 10 },
      ];
      mensal.getRow(1).font = { bold: true };
      for (const [mes, total] of Object.entries(payload.porMes as Record<string, number>).sort()) {
        mensal.addRow({ mes, total });
      }
    }
  }

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
