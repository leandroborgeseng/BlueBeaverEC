import PDFDocument from "pdfkit";

export type OsImpressaoPapel = "A4" | "letter";

export type OsImpressaoOpcoes = {
  observacao: boolean;
  itens: boolean;
  monetario: boolean;
  analiseExterna: boolean;
  preenchido: boolean;
  papel: OsImpressaoPapel;
};

export type OsImpressaoItem = {
  codigo: string;
  quando: string;
  descricao: string;
  quantidade?: string;
  valor?: string;
};

export type OsImpressaoMao = {
  tecnico: string;
  servico: string;
  inicio: string;
  termino: string;
};

export type OsImpressaoMaterial = {
  descricao: string;
  data: string;
  quantidade: string;
  valor?: string;
};

export type OsImpressaoExterno = {
  fornecedor: string;
  servico: string;
  previsao: string;
  valor?: string;
};

export type OsImpressaoPayload = {
  instituicao: string;
  geradoEm: string;
  geradoPor: string;
  codigo: string;
  status: string;
  tipo: string;
  oficina: string;
  abertaEm: string;
  setor: string;
  prioridade: string;
  responsavel: string;
  requisitante: string;
  chamado: string;
  reclamacao: string;
  ocorrencia: string;
  causa: string;
  pendencia: string;
  observacoes: string;
  itens: OsImpressaoItem[];
  mao: OsImpressaoMao[];
  materiais: OsImpressaoMaterial[];
  externos: OsImpressaoExterno[];
  opcoes: OsImpressaoOpcoes;
};

const NAVY = "#1b365d";
const LINE = "#222";
const MUTED = "#555";
const LEGENDA =
  "Legenda: CO - Cancelamento da OS, CT - Certificado, FT - Foto, MO - Mão de Obra, OC - Ocorrência, SO - Solução, PE - Pendência, MT - Material, PO - Parecer de Obsolescência, PR - Procedimento, SE - Serviço Externo, TR - Transporte, LR - Laudo de Recebimento, LI - Laudo de Instalação, AN - Anexos, OB - Obras, AS - Assinaturas";

function fmtQtd(v?: string) {
  return v && v !== "1" ? v : "";
}

export function buildOsImpressaoPdf(payload: OsImpressaoPayload): Promise<Buffer> {
  const size = payload.opcoes.papel === "letter" ? "LETTER" : "A4";
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size, margin: 32, bufferPages: true, info: { Title: `OS ${payload.codigo}`, Author: "Aion Engenharia Clínica" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = 32;
    const right = doc.page.width - 32;
    const width = right - left;
    const footerH = 42;
    let y = 28;

    const chrome = (first: boolean) => {
      y = 28;
      drawHeader(doc, left, y, width, payload, first);
      y = 72;
    };

    chrome(true);
    y = drawCabecalhoOs(doc, left, y, width, payload);

    if (payload.opcoes.itens) {
      y = ensure(doc, y, 36, footerH, () => chrome(false));
      y = drawItens(doc, left, y, width, payload);
    }

    y = ensure(doc, y, 120, footerH, () => chrome(false));
    y = drawAnaliseInterna(doc, left, y, width, payload);

    if (payload.opcoes.analiseExterna) {
      y = ensure(doc, y, 70, footerH, () => chrome(false));
      y = drawAnaliseExterna(doc, left, y, width, payload);
    }

    y = ensure(doc, y, 70, footerH, () => chrome(false));
    drawAssinaturas(doc, left, y, width);

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      drawFooter(doc, left, width, payload, i + 1, range.count);
    }
    doc.end();
  });
}

function ensure(
  doc: PDFKit.PDFDocument,
  y: number,
  needed: number,
  footerH: number,
  header: () => void,
) {
  if (y + needed <= doc.page.height - footerH) return y;
  doc.addPage();
  header();
  return 76;
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  left: number,
  y: number,
  width: number,
  payload: OsImpressaoPayload,
  withDate: boolean,
) {
  doc.save();
  doc.roundedRect(left, y, 18, 18, 3).fill(NAVY);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(9).text("A", left + 5, y + 4, { width: 10, align: "center" });
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(13).text("AION", left + 24, y);
  doc.font("Helvetica").fontSize(5.5).fillColor(NAVY).text("ENGENHARIA CLÍNICA", left + 24, y + 14);

  const hospW = 220;
  doc.roundedRect(left + width - hospW - (withDate ? 92 : 0), y, 18, 18, 3).fill(NAVY);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(8).text("+", left + width - hospW - (withDate ? 92 : 0), y + 5, {
    width: 18,
    align: "center",
  });
  doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(8).text(payload.instituicao || "Hospital", left + width - hospW - (withDate ? 92 : 0) + 22, y, {
    width: hospW - 24,
    height: 20,
    ellipsis: true,
  });

  if (withDate) {
    doc.font("Helvetica").fontSize(8).fillColor("#333").text(payload.geradoEm, left, y + 2, { width, align: "right" });
  }
  doc.restore();
}

function drawCabecalhoOs(
  doc: PDFKit.PDFDocument,
  left: number,
  y: number,
  width: number,
  payload: OsImpressaoPayload,
) {
  doc.lineWidth(1).strokeColor(LINE).rect(left, y, width, 18).stroke();
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111").text("ORDEM DE SERVIÇO", left, y + 4, { width, align: "center" });
  y += 18;

  const row1 = 16;
  doc.rect(left, y, width, row1).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111").text("Nº da OS:", left + 4, y + 4);
  doc.font("Helvetica-Bold").fontSize(9).text(payload.codigo, left + 52, y + 3.5);
  doc.font("Helvetica-Bold").fontSize(8).text(payload.status, left, y + 4, { width: width - 6, align: "right" });
  y += row1;

  const bloco = 54;
  doc.rect(left, y, width, bloco).stroke();
  let iy = y + 5;
  kv(doc, left + 4, iy, "Tipo da OS:", payload.tipo, 62);
  kv(doc, left + 250, iy, "Oficina:", payload.oficina || "—", 42);
  doc.font("Helvetica").fontSize(8).fillColor("#111").text(`Aberta em ${payload.abertaEm || "—"}`, left, iy, {
    width: width - 6,
    align: "right",
  });
  iy += 12;
  kv(doc, left + 4, iy, "Setor:", payload.setor || "—", 62, 240);
  doc.font("Helvetica-Bold").fontSize(8).text("Prioridade:", left + 320, iy);
  doc.font("Helvetica").text(payload.prioridade || "—", left + 378, iy, { width: width - 384 });
  iy += 12;
  kv(doc, left + 4, iy, "Responsável:", payload.responsavel || "—", 62, width - 70);
  iy += 12;
  kv(doc, left + 4, iy, "Requisitante:", payload.requisitante || "—", 62, 250);
  doc.font("Helvetica-Bold").fontSize(8).text("Nº do Chamado:", left + 320, iy);
  doc.font("Helvetica").text(payload.chamado || "—", left + 398, iy, { width: width - 404 });
  y += bloco;

  const rec = wrapHeight(doc, payload.reclamacao || "—", width - 78, 8) + 10;
  doc.rect(left, y, width, rec).stroke();
  doc.font("Helvetica-Bold").fontSize(8).text("Reclamação:", left + 4, y + 4);
  doc.font("Helvetica").fontSize(8).text(payload.reclamacao || "—", left + 72, y + 4, { width: width - 80 });
  return y + rec + 8;
}

function drawItens(doc: PDFKit.PDFDocument, left: number, y: number, width: number, payload: OsImpressaoPayload) {
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111").text("Itens da Ordem de Serviço", left, y, { underline: true });
  doc.font("Helvetica-Bold").text(payload.opcoes.monetario ? "QTD / Valor" : "QTD", left, y, { width, align: "right" });
  y += 12;
  if (!payload.itens.length) {
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text("Nenhum item lançado.", left, y);
    return y + 14;
  }
  for (const item of payload.itens) {
    if (y > doc.page.height - 54) {
      doc.addPage();
      y = 76;
    }
    const qtd = payload.opcoes.monetario
      ? [fmtQtd(item.quantidade), item.valor].filter(Boolean).join(" · ")
      : fmtQtd(item.quantidade);
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#111").text(item.codigo, left, y, { width: 22 });
    doc.font("Helvetica").text(item.quando, left + 24, y, { width: 92 });
    doc.text(item.descricao, left + 118, y, { width: width - 170, ellipsis: true });
    if (qtd) doc.text(qtd, left, y, { width, align: "right" });
    y += 11;
  }
  return y + 6;
}

function drawAnaliseInterna(
  doc: PDFKit.PDFDocument,
  left: number,
  y: number,
  width: number,
  payload: OsImpressaoPayload,
) {
  const fill = payload.opcoes.preenchido;
  const rowH = 14;
  const ocorrW = Math.round(width * 0.62);
  const causaW = width - ocorrW;
  const tecW = Math.round(width * 0.34);
  const servW = Math.round(width * 0.34);
  const iniW = Math.round(width * 0.16);
  const fimW = width - tecW - servW - iniW;
  const matW = Math.round(width * 0.62);
  const dataW = Math.round(width * 0.22);
  const qtdW = width - matW - dataW;

  headerBar(doc, left, y, width, "Análise Interna");
  y += 14;

  cell(doc, left, y, ocorrW, 28, "Ocorrência/Defeito:", fill ? payload.ocorrencia : "", true);
  cell(doc, left + ocorrW, y, causaW, 28, "Causa:", fill ? payload.causa : "", true);
  y += 28;

  cell(doc, left, y, tecW, rowH, "Técnico (USO OBRIGATÓRIO DE EPI OU EPC)", "", true);
  cell(doc, left + tecW, y, servW, rowH, "Serviço/Solução", "", true);
  cell(doc, left + tecW + servW, y, iniW, rowH, "Data/Hora Início", "", true);
  cell(doc, left + tecW + servW + iniW, y, fimW, rowH, "Data/Hora Término", "", true);
  y += rowH;

  const mao = fill && payload.mao.length ? payload.mao : [{ tecnico: "", servico: "", inicio: "", termino: "" }, { tecnico: "", servico: "", inicio: "", termino: "" }, { tecnico: "", servico: "", inicio: "", termino: "" }];
  for (const m of mao.slice(0, 6)) {
    cell(doc, left, y, tecW, rowH, m.tecnico);
    cell(doc, left + tecW, y, servW, rowH, m.servico);
    cell(doc, left + tecW + servW, y, iniW, rowH, m.inicio);
    cell(doc, left + tecW + servW + iniW, y, fimW, rowH, m.termino);
    y += rowH;
  }

  cell(doc, left, y, matW, rowH, "Descrição do Material", "", true);
  cell(doc, left + matW, y, dataW, rowH, "Data", "", true);
  cell(doc, left + matW + dataW, y, qtdW, rowH, payload.opcoes.monetario ? "Qtd / Valor" : "Quantidade", "", true);
  y += rowH;

  const mats =
    fill && payload.materiais.length
      ? payload.materiais
      : [
          { descricao: "", data: "", quantidade: "" },
          { descricao: "", data: "", quantidade: "" },
          { descricao: "", data: "", quantidade: "" },
        ];
  for (const m of mats.slice(0, 8)) {
    const q = payload.opcoes.monetario ? [m.quantidade, m.valor].filter(Boolean).join(" · ") : m.quantidade;
    cell(doc, left, y, matW, rowH, m.descricao);
    cell(doc, left + matW, y, dataW, rowH, m.data);
    cell(doc, left + matW + dataW, y, qtdW, rowH, q);
    y += rowH;
  }

  cell(doc, left, y, width, rowH, fill && payload.pendencia ? `Pendência: ${payload.pendencia}` : "Pendência:", "", true);
  y += rowH;

  if (payload.opcoes.observacao) {
    const obsH = fill && payload.observacoes ? Math.max(56, wrapHeight(doc, payload.observacoes, width - 10, 8) + 16) : 84;
    cell(doc, left, y, width, obsH, "Observações", fill ? payload.observacoes : "", true);
    if (!fill) {
      for (let i = 1; i < 6; i++) {
        const ly = y + 14 + i * 12;
        doc.moveTo(left + 4, ly).lineTo(left + width - 4, ly).strokeColor("#ccc").lineWidth(0.4).stroke();
      }
    }
    y += obsH;
  }
  return y + 18;
}

function drawAnaliseExterna(
  doc: PDFKit.PDFDocument,
  left: number,
  y: number,
  width: number,
  payload: OsImpressaoPayload,
) {
  const fill = payload.opcoes.preenchido;
  const rowH = 14;
  const a = Math.round(width * 0.4);
  const b = Math.round(width * 0.35);
  const c = width - a - b;
  headerBar(doc, left, y, width, "Análise Externa");
  y += 14;
  cell(doc, left, y, a, rowH, "Fornecedor", "", true);
  cell(doc, left + a, y, b, rowH, "Serviço", "", true);
  cell(doc, left + a + b, y, c, rowH, payload.opcoes.monetario ? "Previsão / Valor" : "Previsão", "", true);
  y += rowH;
  const rows =
    fill && payload.externos.length
      ? payload.externos
      : [
          { fornecedor: "", servico: "", previsao: "" },
          { fornecedor: "", servico: "", previsao: "" },
        ];
  for (const r of rows.slice(0, 6)) {
    const prev = payload.opcoes.monetario ? [r.previsao, r.valor].filter(Boolean).join(" · ") : r.previsao;
    cell(doc, left, y, a, rowH, r.fornecedor);
    cell(doc, left + a, y, b, rowH, r.servico);
    cell(doc, left + a + b, y, c, rowH, prev);
    y += rowH;
  }
  return y + 12;
}

function drawAssinaturas(doc: PDFKit.PDFDocument, left: number, y: number, width: number) {
  const col = (width - 40) / 2;
  const x2 = left + col + 40;
  doc.moveTo(left + 24, y).lineTo(left + col - 24, y).strokeColor(LINE).lineWidth(0.7).stroke();
  doc.moveTo(x2 + 24, y).lineTo(x2 + col - 24, y).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111").text("TÉCNICO RESPONSÁVEL", left, y + 6, { width: col, align: "center" });
  doc.text("VISTO DO SETOR", x2, y + 6, { width: col, align: "center" });
  doc.font("Helvetica").fontSize(8).text("Nome:__________________  Data:____/____/______", left, y + 22, {
    width: col,
    align: "center",
  });
  doc.text("Nome:__________________  Data:____/____/______", x2, y + 22, { width: col, align: "center" });
}

function drawFooter(
  doc: PDFKit.PDFDocument,
  left: number,
  width: number,
  payload: OsImpressaoPayload,
  page: number,
  pages: number,
) {
  const y = doc.page.height - 48;
  doc.font("Helvetica").fontSize(5.5).fillColor(MUTED).text(LEGENDA, left, y - 12, { width, lineGap: 0.4 });
  doc.fontSize(7).fillColor("#333").text(`Gerado por: ${payload.geradoPor}`, left, y + 10);
  doc.font("Helvetica-Oblique").fontSize(6.5).fillColor(MUTED).text("Aion Engenharia Clínica", left, y + 10, {
    width,
    align: "center",
  });
  doc.font("Helvetica").fontSize(7).fillColor("#333").text(`Pág. ${page} de ${pages}`, left, y + 10, { width, align: "right" });
}

function headerBar(doc: PDFKit.PDFDocument, x: number, y: number, w: number, title: string) {
  doc.lineWidth(0.8).strokeColor(LINE).rect(x, y, w, 14).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111").text(title, x, y + 3, { width: w, align: "center" });
}

function cell(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  extra = "",
  header = false,
) {
  doc.lineWidth(0.6).strokeColor(LINE).rect(x, y, w, h).stroke();
  const label = extra ? `${text}${text.endsWith(":") ? " " : text ? ": " : ""}${extra}` : text;
  doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(7).fillColor("#111").text(label, x + 3, y + 3, {
    width: w - 6,
    height: h - 5,
    ellipsis: true,
  });
}

function kv(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: string, labelW: number, valueW = 180) {
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111").text(label, x, y, { width: labelW });
  doc.font("Helvetica").text(value, x + labelW, y, { width: valueW, ellipsis: true });
}

function wrapHeight(doc: PDFKit.PDFDocument, text: string, width: number, fontSize: number) {
  doc.font("Helvetica").fontSize(fontSize);
  return Math.max(12, doc.heightOfString(text || "—", { width }));
}
