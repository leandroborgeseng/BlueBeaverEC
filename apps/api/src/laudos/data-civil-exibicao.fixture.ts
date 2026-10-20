/** Fixture do teste F1: gera o PDF com certificado 2027-03-01 00:00Z e imprime o texto (pdftotext) no stdout. Rodado com TZ variando. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRelatorioServicoPdf } from "./relatorio-servico-pdf";

void (async () => {
  const pdf = await buildRelatorioServicoPdf({
    instituicao: { nome: "Hospital Teste" }, numero: "L-F1", tipo: "CALIBRACAO", statusDocumento: "FINAL",
    dataExecucao: "2027-03-01T00:00:00.000Z",
    equipamento: { tag: "T1", nome: "Monitor" }, executores: [], respostas: [],
    instrumento: { nome: "ESA612", nSerie: "1", certificado: { numero: "C-TESTE-1", dataValidade: "2027-03-01T00:00:00.000Z", fatorAbrangencia: 2, probabilidadeAbrangencia: null, pontos: [] } },
  } as any);
  const f = join(mkdtempSync(join(tmpdir(), "pdf-f1-")), "l.pdf");
  writeFileSync(f, pdf);
  process.stdout.write(execFileSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" }));
})();
