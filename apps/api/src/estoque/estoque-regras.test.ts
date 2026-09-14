import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarDeltaSaldo,
  conflitoOrcamentoViradoServico,
  conflitoPecaComoServico,
  consumirSimultaneos,
  custoMedioPonderado,
  exigeDestinoFisicoParaDevolver,
  itemCustoContaComoRealizado,
  METODO_VALORIZACAO_ESTOQUE,
  podeConsumir,
  qtdNovaBaixa,
  resolverValorHoraMaoDeObra,
  somarCustoRealizado,
} from "@aion/shared";

describe("valorizacao custo medio ponderado", () => {
  it("documenta o método escolhido", () => {
    assert.equal(METODO_VALORIZACAO_ESTOQUE, "CUSTO_MEDIO_PONDERADO");
  });

  it("entrada 10 a 10 + 10 a 20 vira médio 15", () => {
    const aposPrimeira = custoMedioPonderado(0, 0, 10, 10);
    assert.equal(aposPrimeira, 10);
    assert.equal(custoMedioPonderado(10, 10, 10, 20), 15);
  });

  it("consumo preserva o médio do item (histórico no lançamento)", () => {
    const medio = custoMedioPonderado(10, 15, 0, 0);
    assert.equal(medio, 15);
  });
});

describe("saldo e concorrencia", () => {
  it("impede saldo negativo", () => {
    assert.equal(podeConsumir(5, 0, 6).ok, false);
    assert.equal(aplicarDeltaSaldo(2, -3).ok, false);
    const ok = aplicarDeltaSaldo(2, -2);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.saldo, 0);
  });

  it("dois consumos simultâneos de 8 em saldo 10: um passa, o outro falha", () => {
    const r = consumirSimultaneos(10, [8, 8]);
    assert.equal(r.resultados[0]?.ok, true);
    assert.equal(r.resultados[1]?.ok, false);
    assert.equal(r.saldoFinal, 2);
  });
});

describe("baixa idempotente e custos", () => {
  it("reenvio da mesma qtd não gera segunda baixa", () => {
    assert.equal(qtdNovaBaixa(3, 3), 0);
    assert.equal(qtdNovaBaixa(3, 0), 3);
    assert.equal(qtdNovaBaixa(5, 3), 2);
  });

  it("estimado e aprovado não entram no realizado", () => {
    const s = somarCustoRealizado([
      { tipo: "MATERIAL", quantidade: 2, valorUnitario: 10, naturezaCusto: "ESTIMADO" },
      { tipo: "MATERIAL", quantidade: 2, valorUnitario: 10, naturezaCusto: "APROVADO" },
      { tipo: "MATERIAL", quantidade: 1, valorUnitario: 10, naturezaCusto: "REALIZADO" },
      { tipo: "MATERIAL", quantidade: 1, valorUnitario: 99, naturezaCusto: "REALIZADO", estornado: true },
    ]);
    assert.equal(s.realizado, 10);
    assert.equal(s.estimado, 20);
    assert.equal(s.aprovado, 20);
    assert.equal(itemCustoContaComoRealizado({ naturezaCusto: "ESTIMADO" }), false);
  });

  it("não conta peça de estoque de novo como serviço", () => {
    const r = conflitoPecaComoServico({
      tipoNovo: "SERVICO_EXTERNO",
      descricao: "Sensor de fluxo",
      existentes: [
        { tipo: "MATERIAL", descricao: "Sensor de fluxo", estoqueItemId: "i1", origemMaterial: "ESTOQUE" },
      ],
    });
    assert.equal(r.ok, false);
  });

  it("não vira orçamento aprovado em serviço realizado duplicado", () => {
    const r = conflitoOrcamentoViradoServico({
      naturezaNova: "REALIZADO",
      tipoNovo: "SERVICO_EXTERNO",
      descricao: "Reparo placa",
      existentes: [{ tipo: "SERVICO_EXTERNO", descricao: "Reparo placa", naturezaCusto: "APROVADO" }],
    });
    assert.equal(r.ok, false);
  });
});

describe("mao de obra, estorno e destino fisico", () => {
  it("MO só tem valor com taxa configurada e acesso financeiro", () => {
    assert.equal(resolverValorHoraMaoDeObra({ valorHoraConfigurado: 80, podeVerFinanceiro: false }), null);
    assert.equal(resolverValorHoraMaoDeObra({ valorHoraConfigurado: null, podeVerFinanceiro: true }), null);
    assert.equal(resolverValorHoraMaoDeObra({ valorHoraConfigurado: 80, podeVerFinanceiro: true }), 80);
  });

  it("cancelar/reabrir não devolve material sem destino físico", () => {
    const sem = exigeDestinoFisicoParaDevolver({ acao: "cancelar", qtdBaixadaNaoEstornada: 2 });
    assert.equal(sem.ok, false);
    const estoque = exigeDestinoFisicoParaDevolver({
      acao: "cancelar",
      qtdBaixadaNaoEstornada: 2,
      destinoFisico: "ESTOQUE",
    });
    assert.equal(estoque.ok, true);
    if (estoque.ok) assert.equal(estoque.devolveAoEstoque, true);
    const uso = exigeDestinoFisicoParaDevolver({
      acao: "reabrir",
      qtdBaixadaNaoEstornada: 2,
      destinoFisico: "USO_CONFIRMADO",
    });
    assert.equal(uso.ok, true);
    if (uso.ok) assert.equal(uso.devolveAoEstoque, false);
  });
});
