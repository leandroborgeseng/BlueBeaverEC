import PDFDocument from "pdfkit";
import { avisoAssinaturaNaoCertificada, labelTipoIntervencao, tituloDocumentoTecnico } from "./laudo-regras";

export type RelatorioServicoPayload = {
  instituicao: { nome: string; cnpj?: string | null };
  numero: string;
  tipo: string;
  statusDocumento: string;
  dataExecucao?: string | Date | null;
  osNumero?: number | null;
  osCodigo?: string | null;
  equipamento: {
    tag: string;
    nome: string;
    setor?: string | null;
    fabricante?: string | null;
    modelo?: string | null;
    nSerie?: string | null;
  };
  executores: { papel: string; nome: string; registro?: string | null }[];
  procedimento?: { nome: string; versao?: number | null } | null;
  respostas: Array<{
    secao?: string;
    pergunta?: string;
    tipo?: string;
    status?: string;
    unidade?: string;
    grandeza?: string;
    valorReferencia?: number | string | null;
    valorMedido?: number | string | null;
    leituras?: Array<number | null | undefined>;
    erroAbs?: number | null;
    erroPct?: number | null;
    limite?: number | string | null;
    toleranciaTexto?: string;
    observacao?: string;
  }>;
  instrumento?: {
    nome: string;
    identificacao?: string;
    nSerie?: string;
    tipoAnalisador?: string | null;
    certificado?: {
      numero?: string | null;
      dataValidade?: string | null;
      laboratorioEmissor?: string | null;
      statusNaData?: string | null;
    } | null;
  } | null;
  resultado?: string | null;
  justificativaRessalva?: string | null;
  anexos?: Array<{ nomeArquivo: string }>;
  revisoes?: Array<{ autorNome: string; createdAt: string | Date; justificativa: string }>;
  finalizadoPorNome?: string | null;
  finalizadoEm?: string | Date | null;
  visivelPortal?: boolean;
};

function fmtData(v?: string | Date | null): string {
  if (!v) return "—";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number, header: () => void) {
  if (doc.y + needed > doc.page.height - 52) {
    doc.addPage();
    header();
  }
}

export function buildRelatorioServicoPdf(payload: RelatorioServicoPayload): Promise<Buffer> {
  const docTitle = tituloDocumentoTecnico(payload.tipo);
  const rascunho = payload.statusDocumento !== "FINAL";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const pageW = doc.page.width - 80;
    const left = 40;
    const chrome = () => {
      doc.fillColor("#2f4f9a").fontSize(11).font("Helvetica-Bold").text("Aion Engenharia Clínica", left, 28, { width: pageW });
      doc.font("Helvetica").fontSize(8).fillColor("#555").text(payload.instituicao.nome, left, 44, { width: pageW });
      if (payload.instituicao.cnpj) doc.text(`CNPJ ${payload.instituicao.cnpj}`, left, 56, { width: pageW });
      doc.moveTo(left, 72).lineTo(left + pageW, 72).strokeColor("#ccc").stroke();
      doc.y = 80;
    };
    chrome();

    doc.fillColor("#111").fontSize(14).font("Helvetica-Bold").text(docTitle.titulo, { width: pageW });
    doc.font("Helvetica").fontSize(10).fillColor("#333").text(`${docTitle.subtipo} · ${payload.numero}`, { width: pageW });
    doc.fillColor(rascunho ? "#8a4b08" : "#1b5e20").fontSize(9).text(
      rascunho ? "RASCUNHO — este documento ainda não é a versão final." : "Documento final",
      { width: pageW },
    );
    doc.moveDown(0.5);

    const meta: [string, string][] = [
      ["TAG", payload.equipamento.tag || "—"],
      ["Equipamento", payload.equipamento.nome || "—"],
      ["Setor", payload.equipamento.setor || "—"],
      ["Nº série", payload.equipamento.nSerie || "—"],
      ["OS", payload.osCodigo || (payload.osNumero != null ? String(payload.osNumero) : "—")],
      ["Data do serviço", fmtData(payload.dataExecucao)],
      [
        "Procedimento",
        payload.procedimento?.nome
          ? `${payload.procedimento.nome}${payload.procedimento.versao != null ? ` · v${payload.procedimento.versao}` : ""}`
          : "—",
      ],
      ["Resultado", payload.resultado?.replace(/_/g, " ") || "—"],
    ];
    doc.fontSize(9).fillColor("#222");
    for (const [k, v] of meta) {
      ensureSpace(doc, 18, chrome);
      const y = doc.y;
      doc.font("Helvetica-Bold").text(k, left, y, { width: 110 });
      doc.font("Helvetica").text(String(v), left + 114, y, { width: pageW - 114 });
      doc.y = Math.max(doc.y, y + 13);
    }

    ensureSpace(doc, 28, chrome);
    doc.moveDown(0.3);
    doc.fillColor("#2f4f9a").fontSize(10).font("Helvetica-Bold").text("Executores");
    doc.font("Helvetica").fontSize(9).fillColor("#222");
    if (!payload.executores.length) doc.text("Não informado");
    else for (const e of payload.executores) {
      ensureSpace(doc, 12, chrome);
      doc.text(`${e.papel}: ${e.nome}${e.registro ? ` · ${e.registro}` : ""}`, { width: pageW });
    }

    if (payload.instrumento) {
      ensureSpace(doc, 40, chrome);
      doc.moveDown(0.3);
      doc.fillColor("#2f4f9a").fontSize(10).font("Helvetica-Bold").text("Instrumento na data do serviço");
      doc.font("Helvetica").fontSize(9).fillColor("#222").text(
        [payload.instrumento.nome, payload.instrumento.identificacao || payload.instrumento.nSerie, payload.instrumento.tipoAnalisador]
          .filter(Boolean)
          .join(" · "),
        { width: pageW },
      );
      const c = payload.instrumento.certificado;
      if (c) {
        doc.fontSize(8).fillColor("#444").text(
          [c.numero ? `Cert. padrão ${c.numero}` : null, c.dataValidade ? `validade ${fmtData(c.dataValidade)}` : null, c.laboratorioEmissor, c.statusNaData ? `situação na data: ${c.statusNaData.replace(/_/g, " ")}` : null]
            .filter(Boolean)
            .join(" · "),
          { width: pageW },
        );
      }
      doc.fontSize(8).fillColor("#555").text("Medições lançadas manualmente. Sem acoplamento a protocolo de analisador.");
    }

    const cols = [
      { key: "item", label: "Item", w: 150 },
      { key: "ref", label: "Referência", w: 62 },
      { key: "medido", label: "Medido", w: 70 },
      { key: "limite", label: "Limites", w: 70 },
      { key: "status", label: "Situação", w: 70 },
      { key: "obs", label: "Observação", w: 93 },
    ];
    const headerTabela = (titulo?: string) => {
      if (titulo) {
        ensureSpace(doc, 30, chrome);
        doc.fontSize(8).fillColor("#2f4f9a").font("Helvetica-Bold").text(titulo, { width: pageW });
        doc.font("Helvetica");
      }
      const y = doc.y;
      doc.save();
      doc.rect(left, y, pageW, 16).fill("#eef2fb");
      doc.restore();
      let cx = left;
      doc.fontSize(7).fillColor("#334").font("Helvetica-Bold");
      for (const c of cols) {
        doc.text(c.label, cx + 2, y + 4, { width: c.w - 4 });
        cx += c.w;
      }
      doc.font("Helvetica");
      doc.y = y + 16;
    };

    doc.moveDown(0.4);
    ensureSpace(doc, 36, chrome);
    doc.fillColor("#2f4f9a").fontSize(10).font("Helvetica-Bold").text("Atividades e resultados");
    doc.font("Helvetica");
    let secao = "";
    const rows = payload.respostas ?? [];
    if (!rows.length) doc.fontSize(9).fillColor("#666").text("Nenhum item registrado.");
    for (const r of rows) {
      if (r.secao && r.secao !== secao) {
        secao = r.secao;
        headerTabela(secao);
      } else if (!secao) {
        secao = "Itens";
        headerTabela();
      }
      const leituras = (r.leituras ?? []).filter((v) => v != null);
      const medido = leituras.length
        ? `${leituras.join(" / ")}${r.valorMedido != null ? ` → ${r.valorMedido}` : ""}`
        : r.valorMedido != null
          ? String(r.valorMedido)
          : r.status === "SIM"
            ? "C"
            : r.status === "NAO"
              ? "N.C"
              : r.status === "NA"
                ? "N.A"
                : "—";
      const values: Record<string, string> = {
        item: [r.pergunta, r.unidade ? `(${r.unidade})` : null].filter(Boolean).join(" ") || "—",
        ref: r.valorReferencia != null ? `${r.valorReferencia}${r.unidade ? ` ${r.unidade}` : ""}` : r.grandeza || "—",
        medido: String(medido),
        limite: String(r.toleranciaTexto || r.limite || "—"),
        status: (r.status ?? "—").replace(/_/g, " "),
        obs: r.observacao || "—",
      };
      const h = Math.max(
        16,
        ...cols.map((c) => doc.heightOfString(values[c.key], { width: c.w - 4, lineGap: 1 }) + 6),
      );
      ensureSpace(doc, h + 4, () => {
        chrome();
        headerTabela(secao);
      });
      const y = doc.y;
      let cx = left;
      doc.fontSize(7).fillColor("#222");
      for (const c of cols) {
        if (c.key === "item") doc.font("Helvetica-Bold");
        doc.text(values[c.key], cx + 2, y + 2, { width: c.w - 4, lineGap: 1 });
        doc.font("Helvetica");
        cx += c.w;
      }
      doc.y = y + h;
      doc.strokeColor("#eee").moveTo(left, doc.y).lineTo(left + pageW, doc.y).stroke();
    }

    if (payload.justificativaRessalva) {
      ensureSpace(doc, 28, chrome);
      doc.moveDown(0.4);
      doc.fillColor("#2f4f9a").fontSize(10).font("Helvetica-Bold").text("Ressalva");
      doc.font("Helvetica").fontSize(9).fillColor("#222").text(payload.justificativaRessalva, { width: pageW });
    }
    if (payload.anexos?.length) {
      ensureSpace(doc, 24, chrome);
      doc.moveDown(0.3);
      doc.fillColor("#2f4f9a").fontSize(10).font("Helvetica-Bold").text("Anexos pertinentes");
      doc.font("Helvetica").fontSize(8).fillColor("#222");
      for (const a of payload.anexos) {
        ensureSpace(doc, 12, chrome);
        doc.text(`• ${a.nomeArquivo}`, { width: pageW });
      }
    }
    if (payload.revisoes?.length) {
      ensureSpace(doc, 24, chrome);
      doc.moveDown(0.3);
      doc.fillColor("#2f4f9a").fontSize(10).font("Helvetica-Bold").text("Histórico de retificações");
      doc.font("Helvetica").fontSize(8).fillColor("#222");
      for (const rev of payload.revisoes) {
        ensureSpace(doc, 16, chrome);
        doc.text(`${fmtData(rev.createdAt)} · ${rev.autorNome}: ${rev.justificativa}`, { width: pageW });
      }
    }

    ensureSpace(doc, 50, chrome);
    doc.moveDown(0.6);
    if (payload.statusDocumento === "FINAL" && payload.finalizadoPorNome) {
      doc.fontSize(9).fillColor("#222").font("Helvetica-Bold").text(
        `Finalizado por ${payload.finalizadoPorNome} em ${fmtData(payload.finalizadoEm)}`,
        { width: pageW },
      );
    } else {
      doc.fontSize(9).fillColor("#8a4b08").text("Documento em rascunho — ainda não finalizado.", { width: pageW });
    }
    doc.font("Helvetica").fontSize(7).fillColor("#666").text(avisoAssinaturaNaoCertificada(), { width: pageW });
    doc.fontSize(7).fillColor("#888").text(
      `${docTitle.titulo} (${labelTipoIntervencao(payload.tipo)}). Não é certificado de calibração.`,
      { width: pageW },
    );

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(pages.start + i);
      doc.fontSize(7).fillColor("#888").text(
        `${payload.equipamento.tag} · ${payload.numero} · ${i + 1}/${pages.count}`,
        left,
        doc.page.height - 36,
        { width: pageW, align: "right" },
      );
    }
    doc.end();
  });
}
