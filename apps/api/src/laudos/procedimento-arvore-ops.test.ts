/** E2 — operações do editor (UX §2/§6 itens 2–4): mover, aninhar, desaninhar, "Mover para…", 3 níveis. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { anunciarPosicao, avancar, destinosValidos, duplicarNo, inserirNo, moverCimaBaixo, moverPara, numerarArvore, recuar, type NoArvore } from "@aion/shared";

const item = (id: string): NoArvore => ({ id, titulo: id.toUpperCase(), item: { id, tipo: "REGISTRO", titulo: id.toUpperCase() } });
const base = (): NoArvore[] => [
  { id: "s1", titulo: "Seção 1", filhos: [item("a"), item("b")] },
  { id: "s2", titulo: "Seção 2", filhos: [{ id: "s2.1", titulo: "Sub", filhos: [item("c")] }] },
  item("d"),
];

describe("operações da árvore", () => {
  it("Alt+↑/↓ troca com o irmão; anuncia a nova posição", () => {
    const r = moverCimaBaixo(base(), "b", -1);
    assert.deepEqual(r[0].filhos!.map((n) => n.id), ["b", "a"]);
    assert.equal(anunciarPosicao(r, "b"), "B movido para posição 1 de 2 em Seção 1");
    const t = base();
    assert.equal(moverCimaBaixo(t, "a", -1), t, "primeiro não sobe");
  });
  it("Alt+→ aninha no irmão anterior se for seção; item não recebe filhos", () => {
    const r = recuar(base(), "d");
    assert.deepEqual(r.map((n) => n.id), ["s1", "s2"]);
    assert.equal(r[1].filhos!.at(-1)!.id, "d");
    const semMudanca = base();
    assert.equal(recuar(semMudanca, "b"), semMudanca, "anterior é item → não aninha");
  });
  it("não passa de 3 níveis", () => {
    const t = base();
    assert.equal(recuar(t, "s2"), t, "s2 tem altura 3; dentro de s1 viraria 4 níveis");
    assert.equal(inserirNo(t, "s2.1", { id: "x", titulo: "X", filhos: [item("y")] }), t);
  });
  it("Alt+← desaninha para depois do pai", () => {
    const r = avancar(base(), "a");
    assert.deepEqual(r.map((n) => n.id), ["s1", "a", "s2", "d"]);
  });
  it("Mover para… lista só destinos válidos e move", () => {
    const d = destinosValidos(base(), "d").map((x) => x.id);
    assert.deepEqual(d, [null, "s1", "s2", "s2.1"]);
    assert.ok(!destinosValidos(base(), "s2").some((x) => x.id === "s2.1"), "não entra em si mesmo");
    const r = moverPara(base(), "d", "s2.1");
    assert.deepEqual(numerarArvore(r).find((x) => x.id === "d")?.numero, "2.1.2");
  });
  it("duplicar gera ids novos", () => {
    let n = 0;
    const r = duplicarNo(base(), "s1", (b) => `${b}-n${n++}`);
    assert.equal(r[1].titulo, "Seção 1 (cópia)");
    assert.notEqual(r[1].filhos![0].id, "a");
    assert.equal(r[1].filhos![0].item!.id, r[1].filhos![0].id);
  });
});
