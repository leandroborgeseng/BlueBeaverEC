import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcularSlaOs, horasSlaOs } from "@aion/shared";

describe("SLA por tipo de equipamento", () => {
  it("usa o prazo do tipo e ignora a prioridade", () => {
    const r = horasSlaOs({
      prioridade: "URGENTE",
      slaConclusaoHoras: 48,
      slaAtendimentoHoras: 4,
      status: "EM_ANDAMENTO",
    });
    assert.deepEqual(r, { horas: 48, fonte: "tipo" });
  });

  it("usa 1º atendimento quando a OS ainda não começou e não há prazo de conclusão", () => {
    const r = horasSlaOs({
      prioridade: "MEDIA",
      slaAtendimentoHoras: 6,
      status: "NAO_ATRIBUIDA",
    });
    assert.deepEqual(r, { horas: 6, fonte: "tipo" });
  });

  it("cai na prioridade se o tipo não tiver SLA", () => {
    const r = horasSlaOs({ prioridade: "ALTA", status: "ABERTA" });
    assert.deepEqual(r, { horas: 8, fonte: "prioridade" });
  });

  it("calcula limite, estouro e minutos restantes a partir da abertura", () => {
    const abertura = new Date("2026-09-13T10:00:00.000Z");
    const agora = new Date("2026-09-13T13:00:00.000Z");
    const sla = calcularSlaOs({
      abertura,
      status: "ABERTA",
      prioridade: "MEDIA",
      slaConclusaoHoras: 4,
      agora,
    });
    assert.equal(sla.slaLimite.toISOString(), "2026-09-13T14:00:00.000Z");
    assert.equal(sla.slaEstourado, false);
    assert.equal(sla.slaMinutosRestantes, 60);
    assert.equal(sla.slaFonte, "tipo");
  });

  it("marca estouro quando passou do limite e a OS segue aberta", () => {
    const sla = calcularSlaOs({
      abertura: "2026-09-13T08:00:00.000Z",
      status: "EM_ANDAMENTO",
      prioridade: "BAIXA",
      slaConclusaoHoras: 2,
      agora: "2026-09-13T11:00:00.000Z",
    });
    assert.equal(sla.slaEstourado, true);
    assert.equal(sla.slaMinutosRestantes, -60);
  });

  it("não marca estouro em OS concluída", () => {
    const sla = calcularSlaOs({
      abertura: "2026-09-13T08:00:00.000Z",
      fechamento: "2026-09-13T12:00:00.000Z",
      status: "CONCLUIDA",
      prioridade: "MEDIA",
      slaConclusaoHoras: 2,
      agora: "2026-09-13T18:00:00.000Z",
    });
    assert.equal(sla.slaEstourado, false);
  });
});
