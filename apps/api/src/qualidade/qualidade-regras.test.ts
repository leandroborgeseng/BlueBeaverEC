import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  acoesNaoInferemCausalidade,
  alertaPermiteNotificacaoAutomatica,
  aplicarCondicaoUsoAutomaticamente,
  efeitoPublicarVersao,
  inferirCausalidade,
  manualFabricanteNaoEProcedimento,
  ocorrenciaESensivel,
  payloadContemDadoPaciente,
  periodoBuscaValido,
  podeConcluirOcorrencia,
  presencaConfereCompetencia,
  recusarDadoPaciente,
  transicaoStatusDocumento,
  transicaoStatusOcorrencia,
  versaoVigente,
} from "@aion/shared";

describe("documento controlado", () => {
  it("localiza a versão vigente", () => {
    const vigente = versaoVigente([
      { id: "1", status: "RASCUNHO" },
      { id: "2", status: "VIGENTE" },
      { id: "3", status: "OBSOLETO" },
    ]);
    assert.equal(vigente?.id, "2");
  });

  it("ao publicar, a vigente anterior fica obsoleta", () => {
    const r = efeitoPublicarVersao("v1", "v2");
    assert.equal(r.vigenteId, "v2");
    assert.equal(r.obsoletarId, "v1");
  });

  it("não republica rascunho a partir de obsoleto", () => {
    const r = transicaoStatusDocumento("OBSOLETO", "VIGENTE");
    assert.equal(r.ok, false);
  });

  it("recusa manual de fabricante como procedimento institucional", () => {
    assert.equal(manualFabricanteNaoEProcedimento("MANUAL"), true);
    assert.equal(manualFabricanteNaoEProcedimento("GARANTIA"), true);
    assert.equal(manualFabricanteNaoEProcedimento(null), false);
  });
});

describe("treinamento", () => {
  it("presença não confere competência", () => {
    assert.equal(presencaConfereCompetencia(), false);
  });
});

describe("ocorrência de segurança", () => {
  it("exige medidas imediatas e investigação ou ação para concluir", () => {
    assert.equal(podeConcluirOcorrencia({ medidasImediatas: "", investigacoes: 1, acoes: 0, acoesAbertas: 0 }).ok, false);
    assert.equal(podeConcluirOcorrencia({ medidasImediatas: "Isolou o equipamento", investigacoes: 0, acoes: 0, acoesAbertas: 0 }).ok, false);
    assert.equal(
      podeConcluirOcorrencia({
        medidasImediatas: "Isolou o equipamento",
        investigacoes: 1,
        acoes: 1,
        acoesAbertas: 1,
      }).ok,
      false,
    );
    assert.equal(
      podeConcluirOcorrencia({
        medidasImediatas: "Isolou o equipamento",
        investigacoes: 1,
        acoes: 1,
        acoesAbertas: 0,
      }).ok,
      true,
    );
  });

  it("não infere causalidade nem altera condição de uso sozinha", () => {
    assert.equal(inferirCausalidade("FALHA", "quebra"), null);
    assert.equal(acoesNaoInferemCausalidade(), true);
    assert.equal(aplicarCondicaoUsoAutomaticamente(), false);
  });

  it("marca suspeita de evento adverso como acesso sensível", () => {
    assert.equal(ocorrenciaESensivel("SUSPEITA_EVENTO_ADVERSO", false), true);
    assert.equal(ocorrenciaESensivel("FALHA", false), false);
    assert.equal(ocorrenciaESensivel("FALHA", true), true);
  });

  it("acompanha o fluxo até a conclusão sem pular etapas", () => {
    assert.equal(transicaoStatusOcorrencia("ABERTA", "EM_INVESTIGACAO").ok, true);
    assert.equal(transicaoStatusOcorrencia("ABERTA", "CONCLUIDA").ok, false);
    assert.equal(transicaoStatusOcorrencia("EM_INVESTIGACAO", "ACOES_EM_ANDAMENTO").ok, true);
    assert.equal(transicaoStatusOcorrencia("ACOES_EM_ANDAMENTO", "CONCLUIDA").ok, true);
  });
});

describe("alertas e isolamento de dados", () => {
  it("alerta de fabricante não dispara notificação automática", () => {
    assert.equal(alertaPermiteNotificacaoAutomatica(), false);
  });

  it("recusa campos de paciente", () => {
    assert.equal(payloadContemDadoPaciente({ descricao: "falha no cabo" }), null);
    assert.equal(payloadContemDadoPaciente({ pacienteNome: "João" }), "pacienteNome");
    assert.throws(() => recusarDadoPaciente({ prontuario: "123" }), /paciente/i);
  });

  it("valida período de busca", () => {
    assert.equal(periodoBuscaValido("2026-01-01", "2026-01-31").ok, true);
    assert.equal(periodoBuscaValido("2026-02-01", "2026-01-01").ok, false);
  });
});
