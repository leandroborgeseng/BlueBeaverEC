import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extrairCodigoQr,
  garantiaVigente,
  payloadQrAutenticado,
  proximaTagHef,
  serieContaComoDuplicata,
  validarLoteImportacao,
} from "./equipamento-regras";

describe("inventário — regras", () => {
  it("série vazia não conta como duplicata", () => {
    assert.equal(serieContaComoDuplicata(""), false);
    assert.equal(serieContaComoDuplicata("   "), false);
    assert.equal(serieContaComoDuplicata(null), false);
    assert.equal(serieContaComoDuplicata("SN-1"), true);
  });

  it("gera próxima TAG HEF-NNNN a partir do inventário oficial", () => {
    assert.equal(proximaTagHef([]), "HEF-0001");
    assert.equal(proximaTagHef(["HEF-0001", "HEF-0404", "EQ-9"]), "HEF-0405");
  });

  it("QR autenticado não embute URL pública", () => {
    const payload = payloadQrAutenticado("tok123");
    assert.equal(payload, "aion:eq:tok123");
    assert.doesNotMatch(payload, /https?:\/\//);
    assert.equal(extrairCodigoQr("aion:eq:tok123"), "tok123");
    assert.equal(extrairCodigoQr("HEF-0012"), "HEF-0012");
    assert.equal(extrairCodigoQr("https://hef.aion.eng.br/equipamentos/HEF-0012"), "HEF-0012");
  });

  it("importação recusa overwrite e série/patrimônio duplicados; série vazia passa", () => {
    const existentes = {
      tags: new Set(["hef-0001"]),
      series: new Set(["sn-aa"]),
      patrimonios: new Set(["pat-1"]),
      idInternas: new Set<string>(),
    };
    const out = validarLoteImportacao(
      [
        { tag: "HEF-0001", nome: "Monitor" },
        { nome: "Bomba", nSerie: "  " },
        { nome: "Outra", nSerie: "SN-AA" },
        { nome: "Terceira", patrimonio: "PAT-1" },
        { tag: "HEF-0999", nome: "Novo", nSerie: "SN-NOVO" },
        { tag: "HEF-0999", nome: "Repetido no arquivo" },
      ],
      existentes,
    );
    assert.equal(out[0].ok, false);
    if (!out[0].ok) assert.match(out[0].erro, /não sobrescreve/);
    assert.equal(out[1].ok, true);
    assert.equal(out[2].ok, false);
    if (!out[2].ok) assert.match(out[2].erro, /série/);
    assert.equal(out[3].ok, false);
    assert.equal(out[4].ok, true);
    assert.equal(out[5].ok, false);
    if (!out[5].ok) assert.match(out[5].erro, /repetida/);
  });

  it("garantia vigente é data, não situação de ciclo", () => {
    assert.equal(garantiaVigente("2099-01-01"), true);
    assert.equal(garantiaVigente("2001-01-01"), false);
    assert.equal(garantiaVigente(null), false);
  });
});
