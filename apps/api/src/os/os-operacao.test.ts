import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { atribuicaoConflitou, transicaoStatusOS } from "./os-transicoes";
import { ehSolicitante, filtrarTimeline, textoTransferencia, visibilidadeLog } from "./os-visibilidade";
import { prioridadeInicialDoPedido } from "../solicitacoes/converter-solicitacao-em-os";

describe("transicoes OS", () => {
  it("mapeia estados operacionais", () => {
    assert.equal(transicaoStatusOS("NAO_ATRIBUIDA", "iniciar", false).ok, true);
    assert.equal(transicaoStatusOS("ABERTA", "aguardar", true).ok, true);
    assert.equal(transicaoStatusOS("EM_ANDAMENTO", "aguardar", true).ok, true);
    assert.deepEqual(transicaoStatusOS("AGUARDANDO", "retomar", true), {
      ok: true,
      proximo: "EM_ANDAMENTO",
    });
    const jaFechada = transicaoStatusOS("CONCLUIDA", "fechar", true);
    assert.equal(jaFechada.ok, false);
    if (!jaFechada.ok) {
      assert.match(jaFechada.erro, /já está concluída/i);
    }
    assert.equal(transicaoStatusOS("ABERTA", "reabrir", true).ok, false);
    assert.deepEqual(transicaoStatusOS("CONCLUIDA", "reabrir", true), {
      ok: true,
      proximo: "ABERTA",
    });
    assert.deepEqual(transicaoStatusOS("CONCLUIDA", "reabrir", false), {
      ok: true,
      proximo: "NAO_ATRIBUIDA",
    });
    assert.equal(transicaoStatusOS("NAO_ATRIBUIDA", "aguardar", false).ok, false);
    assert.equal(transicaoStatusOS("CANCELADA", "cancelar", true).ok, false);
  });

  it("exige motivo implícito só na regra de aguardar (status)", () => {
    const t = transicaoStatusOS("EM_ANDAMENTO", "aguardar", true);
    assert.equal(t.ok, true);
    if (t.ok) assert.equal(t.proximo, "AGUARDANDO");
  });
});

describe("concorrencia atribuicao", () => {
  it("detecta overwrite quando a versão ou o responsável mudou", () => {
    assert.equal(
      atribuicaoConflitou({
        atualResponsavelId: "a",
        expectedResponsavelId: null,
        atualVersao: 1,
        expectedVersao: 0,
      }),
      true,
    );
    assert.equal(
      atribuicaoConflitou({
        atualResponsavelId: "a",
        expectedResponsavelId: "a",
        atualVersao: 2,
        expectedVersao: 2,
      }),
      false,
    );
    assert.equal(
      atribuicaoConflitou({
        atualResponsavelId: "b",
        expectedResponsavelId: null,
        atualVersao: 0,
      }),
      true,
    );
  });
});

describe("visibilidade", () => {
  it("esconde interno do solicitante e preserva público", () => {
    assert.equal(ehSolicitante("SOLICITANTE"), true);
    assert.equal(visibilidadeLog("CHECKLIST_MOBILE"), "INTERNO");
    assert.equal(visibilidadeLog("ABERTURA"), "PUBLICO");
    const timeline = filtrarTimeline(
      [
        { visibilidade: "PUBLICO" as const, acao: "ABERTURA" },
        { visibilidade: "INTERNO" as const, acao: "DIAGNOSTICO" },
        { visibilidade: "PUBLICO" as const, acao: "COMENTARIO" },
        { visibilidade: "INTERNO" as const, acao: "ANEXO" },
      ],
      "SOLICITANTE",
    );
    assert.equal(timeline.length, 2);
    assert.deepEqual(
      timeline.map((t) => t.acao),
      ["ABERTURA", "COMENTARIO"],
    );
  });

  it("equipe vê nota e anexo internos", () => {
    const timeline = filtrarTimeline(
      [
        { visibilidade: "INTERNO" as const, acao: "DIAGNOSTICO" },
        { visibilidade: "INTERNO" as const, acao: "ANEXO" },
      ],
      "ENGENHEIRO",
    );
    assert.equal(timeline.length, 2);
  });
});

describe("triagem e transferência", () => {
  it("pedido parado começa alta; sem parada, média — urgência do setor não vira prioridade técnica", () => {
    assert.equal(prioridadeInicialDoPedido({ equipamentoParado: true }), "ALTA");
    assert.equal(prioridadeInicialDoPedido({ equipamentoParado: false }), "MEDIA");
  });

  it("texto de transferência nomeia os dois profissionais", () => {
    assert.equal(textoTransferencia("Ana", "Carlos"), "Transferida de Ana para Carlos");
    assert.equal(textoTransferencia(null, "Carlos"), "Transferida de sem responsável para Carlos");
  });
});
