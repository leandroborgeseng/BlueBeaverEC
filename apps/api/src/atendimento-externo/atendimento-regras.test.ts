import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  alertaVencimentoDias,
  custosEncaminhamento,
  localizacaoDuranteAssistencia,
  podeAbrirEncaminhamento,
  podeLiberarUso,
  recusarContratoComoGarantia,
  situacaoVigencia,
  transicaoAtendimentoExterno,
  validarDecisaoOrcamento,
} from "@aion/shared";

describe("encaminhamento externo", () => {
  it("recusa segunda OS/encaminhamento ativo na mesma OS", () => {
    const dup = podeAbrirEncaminhamento(["ORCAMENTO"]);
    assert.equal(dup.ok, false);
    const livre = podeAbrirEncaminhamento(["LIBERADO", "CANCELADO"]);
    assert.equal(livre.ok, true);
  });

  it("segue orçamento → recebimento → decisão → envio → retorno → conferência", () => {
    assert.equal(transicaoAtendimentoExterno("ORCAMENTO", "registrar_orcamento").ok, true);
    assert.equal(
      transicaoAtendimentoExterno("ORCAMENTO_RECEBIDO", "decidir", {
        temOrcamento: true,
        decisao: "APROVADO",
      }).ok,
      true,
    );
    const envioSemAprovacao = transicaoAtendimentoExterno("DECISAO", "enviar", { decisao: "REPROVADO" });
    assert.equal(envioSemAprovacao.ok, false);
    if (!envioSemAprovacao.ok) assert.match(envioSemAprovacao.erro, /não despacha sozinho/i);

    const envio = transicaoAtendimentoExterno("DECISAO", "enviar", {
      decisao: "APROVADO",
      previsaoRetorno: true,
    });
    assert.equal(envio.ok, true);
    if (envio.ok) assert.equal(envio.proximo, "AGUARDANDO_RETORNO");

    const retorno = transicaoAtendimentoExterno("AGUARDANDO_RETORNO", "retornar");
    assert.equal(retorno.ok, true);

    const aptoSemConf = transicaoAtendimentoExterno("RETORNADO", "conferir", {
      conferenciaOk: false,
      condicaoFinal: "APTO",
    });
    assert.equal(aptoSemConf.ok, false);

    const liberar = transicaoAtendimentoExterno("RETORNADO", "conferir", {
      conferenciaOk: true,
      condicaoFinal: "APTO",
    });
    assert.equal(liberar.ok, true);
    if (liberar.ok) assert.equal(liberar.proximo, "LIBERADO");
  });

  it("não cancela com equipamento fora do hospital", () => {
    const r = transicaoAtendimentoExterno("ENVIADO", "cancelar");
    assert.equal(r.ok, false);
  });
});

describe("garantia ≠ contrato e vencimento configurável", () => {
  it("recusa cadastrar garantia como contrato", () => {
    assert.match(recusarContratoComoGarantia("GARANTIA") ?? "", /aquisição/);
    assert.equal(recusarContratoComoGarantia("MANUTENCAO"), null);
  });

  it("usa a janela de alerta do contrato, não um prazo inventado único", () => {
    const fim = new Date("2026-10-01T12:00:00Z");
    const agora = new Date("2026-09-14T12:00:00Z");
    assert.equal(situacaoVigencia(fim, 7, agora), "VIGENTE");
    assert.equal(situacaoVigencia(fim, 30, agora), "A_VENCER");
    assert.equal(alertaVencimentoDias(fim, agora), "30");
  });
});

describe("decisão, custos e liberação", () => {
  it("sem política interna exige autorização externa com responsável e data", () => {
    const interno = validarDecisaoOrcamento({
      modo: "APROVACAO_INTERNA",
      temAprovacaoInterna: false,
    });
    assert.equal(interno.ok, false);
    const externa = validarDecisaoOrcamento({
      modo: "AUTORIZACAO_EXTERNA",
      temAprovacaoInterna: false,
      responsavelExterno: "Diretoria HEF",
      dataExterna: "2026-09-14",
    });
    assert.equal(externa.ok, true);
  });

  it("separa custo informado, aprovado e realizado", () => {
    const c = custosEncaminhamento(
      [
        { versao: 1, valor: 800, decisao: "REPROVADO" },
        { versao: 2, valor: 1200, decisao: "APROVADO" },
        { versao: 3, valor: 1500, decisao: "PENDENTE" },
      ],
      1100,
    );
    assert.equal(c.informado, 1500);
    assert.equal(c.aprovado, 1200);
    assert.equal(c.realizado, 1100);
  });

  it("não libera APTO sem conferência", () => {
    const r = podeLiberarUso({ status: "RETORNADO", conferenciaOk: false, condicaoFinal: "APTO" });
    assert.equal(r.ok, false);
    assert.equal(
      localizacaoDuranteAssistencia("Acme Biomed"),
      "Fora do hospital · assistência Acme Biomed",
    );
  });
});
