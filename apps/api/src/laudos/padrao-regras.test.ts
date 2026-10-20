import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  janelaAlerta,
  montarAlertasPadroes,
  normalizarNSerie,
  resumoAlertasPadroes,
  sugerirPadrao,
  validarCertificadoPadrao,
  camposObrigatoriosFaltando,
  preferencialCompativel,
  sugerirPadraoLaudo,
} from "./padrao-regras";
import { notificacoesPadroes } from "./padrao-alertas";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const agora = new Date("2026-10-19T12:00:00Z");

describe("E1 crit.1 — nº de série", () => {
  it("normaliza espaços para a unicidade", () => {
    assert.equal(normalizarNSerie("  ESA 612   001 "), "ESA 612 001");
    assert.equal(normalizarNSerie(undefined), "");
  });
});

describe("E1 crit.2 — validação do certificado do padrão", () => {
  const ok = { numero: "RBC-123", dataEmissao: "2026-01-10", dataValidade: "2027-01-10", fatorAbrangencia: 2,
    pontos: [{ unidade: "V", incertezaExpandida: 0.02, fatorK: 2 }] };
  it("certificado completo passa", () => assert.deepEqual(validarCertificadoPadrao(ok), []));
  it("validade antes da emissão é rejeitada", () =>
    assert.match(validarCertificadoPadrao({ ...ok, dataValidade: "2025-12-31" }).join(), /anterior/));
  it("sem número/datas é rejeitado", () => {
    const e = validarCertificadoPadrao({ pontos: [] });
    assert.ok(e.some((x) => /Número/.test(x)) && e.some((x) => /obrigatórias/.test(x)));
  });
  it("U ausente ou negativo e k <= 0 são rejeitados", () => {
    const e = validarCertificadoPadrao({ ...ok, fatorAbrangencia: 0, pontos: [{ unidade: "V", incertezaExpandida: -1, fatorK: 0 }, { unidade: "", incertezaExpandida: null }] });
    assert.ok(e.some((x) => /Fator de abrangência/.test(x)));
    assert.ok(e.some((x) => x === "Ponto 1: U deve ser maior que zero"));
    assert.ok(e.some((x) => /Ponto 1: k/.test(x)));
    assert.ok(e.some((x) => /Ponto 2: unidade/.test(x)));
    assert.ok(e.some((x) => /Ponto 2: incerteza.*obrigatória/.test(x)));
  });
  it("anexo que não é PDF é rejeitado", () =>
    assert.match(validarCertificadoPadrao({ ...ok, anexoMime: "image/png" }).join(), /PDF/));
});

describe("E1 crit.3 — alertas de certificado de padrão", () => {
  const padroes = [
    { id: "a", nome: "ESA612", nSerie: "1", certificadoNumero: "C1", certificadoValidade: "2027-06-01T00:00:00Z" },
    { id: "b", nome: "Impulse 7000", nSerie: "2", certificadoNumero: "C2", certificadoValidade: "2026-11-10T00:00:00Z" },
    { id: "c", nome: "BP Pump", nSerie: "3", certificadoNumero: "C3", certificadoValidade: "2026-10-01T00:00:00Z" },
    { id: "d", nome: "QA-ES", nSerie: "4", certificadoValidade: null },
    { id: "e", nome: "Termo", nSerie: "5", certificadoNumero: "C5", certificadoValidade: "2026-12-30T00:00:00Z" },
  ];
  it("janela padrão 60 dias: vencido, sem certificado e a vencer, nessa ordem; válido fica fora", () => {
    const out = montarAlertasPadroes(padroes, agora);
    assert.deepEqual(out.map((x) => [x.instrumentoId, x.status]), [
      ["c", "VENCIDO"], ["d", "SEM_CERTIFICADO"], ["b", "A_VENCER"],
    ]);
    assert.equal(out[0].dias, -18); // dias civis: 01/10 → 19/10
    assert.equal(out[2].dias, 22); // 19/10 → 10/11
  });
  it("janela configurável (90 dias) inclui o que vence em ~71 dias", () => {
    const out = montarAlertasPadroes(padroes, agora, 90);
    assert.ok(out.some((x) => x.instrumentoId === "e" && x.status === "A_VENCER"));
  });
  it("janela inválida cai para 60", () => {
    assert.equal(janelaAlerta(0), 60);
    assert.equal(janelaAlerta(-5), 60);
    assert.equal(janelaAlerta(Number.NaN), 60);
    assert.equal(janelaAlerta(30), 30);
  });
  it("resumo conta por situação", () => {
    assert.deepEqual(resumoAlertasPadroes(montarAlertasPadroes(padroes, agora)), { vencidos: 1, aVencer: 1, semCertificado: 1, total: 3 });
  });
});

describe("E1 crit.4 — padrão preferencial sugerido", () => {
  const prefs = [{ tipo: "Analisador de desfibrilador", instrumentoId: "p1" }];
  it("usa o preferencial quando selecionável (tipo sem diferenciar maiúsculas)", () => {
    const s = sugerirPadrao("analisador de DESFIBRILADOR", prefs, [
      { id: "p1", tipoAnalisador: "Analisador de desfibrilador", selecionavel: true },
      { id: "p2", tipoAnalisador: "Analisador de desfibrilador", selecionavel: true },
    ]);
    assert.deepEqual(s, { instrumentoId: "p1", origem: "PREFERENCIAL", aviso: null });
  });
  it("preferencial vencido → outro do mesmo tipo, com aviso", () => {
    const s = sugerirPadrao("Analisador de desfibrilador", prefs, [
      { id: "p1", tipoAnalisador: "Analisador de desfibrilador", selecionavel: false },
      { id: "x", tipoAnalisador: "Analisador de PNI", selecionavel: true },
      { id: "p2", tipoAnalisador: "Analisador de desfibrilador", selecionavel: true },
    ]);
    assert.equal(s.instrumentoId, "p2");
    assert.equal(s.origem, "MESMO_TIPO");
    assert.match(s.aviso ?? "", /preferencial não está disponível/);
  });
  it("nenhum válido → sem sugestão", () => {
    const s = sugerirPadrao("Analisador de desfibrilador", prefs, [{ id: "p1", tipoAnalisador: "x", selecionavel: false }]);
    assert.equal(s.instrumentoId, null);
    assert.equal(s.origem, "NENHUM");
  });
  it("sem tipo → sem sugestão", () => assert.equal(sugerirPadrao("", prefs, []).origem, "NENHUM"));
});

describe("Decisão TL E1 #1 — campos obrigatórios", () => {
  it("lista o que falta e aceita cadastro completo", () => {
    assert.deepEqual(camposObrigatoriosFaltando({ grandezas: [" "] }), ["tipo de analisador", "grandezas", "faixa de medição", "resolução"]);
    assert.deepEqual(camposObrigatoriosFaltando({ tipoAnalisador: "x", grandezas: ["V"], faixaMedicao: "0-1", resolucao: "0,1" }), []);
  });
  it("validação do formulário (web) é idêntica à da API", async () => {
    // import dinâmico com caminho em runtime: o arquivo web fica fora do rootDir do tsc da API
    const webPath = resolve(__dirname, "../../../web/src/lib/padrao-cadastro.ts");
    const { camposObrigatoriosFaltando: camposWeb } = (await import(webPath)) as {
      camposObrigatoriosFaltando: typeof camposObrigatoriosFaltando;
    };
    const casos = [{}, { tipoAnalisador: "x" }, { tipoAnalisador: "x", grandezas: ["V"], faixaMedicao: "a", resolucao: "b" }, { grandezas: ["", "A"], resolucao: " " }];
    for (const c of casos) assert.deepEqual(camposWeb(c), camposObrigatoriosFaltando(c));
  });
});

describe("Decisão TL E1 #2 — compatibilidade de tipo", () => {
  it("compara sem acento/caixa/pontuação; vazio nunca é compatível", () => {
    assert.equal(preferencialCompativel("Segurança elétrica", "seguranca-ELETRICA"), true);
    assert.equal(preferencialCompativel("Desfibrilador", "Segurança elétrica"), false);
    assert.equal(preferencialCompativel("Desfibrilador", null), false);
    assert.equal(preferencialCompativel("", ""), false);
  });
});

describe("Decisão TL E1 #3 — regra única de sugestão", () => {
  const cands = [{ id: "d", selecionavel: true }, { id: "s", selecionavel: true }, { id: "v", selecionavel: false }];
  const prefs = [{ tipo: "Desfibrilador", instrumentoId: "d" }, { tipo: "Segurança elétrica", instrumentoId: "s" }];
  it("casa pelo nome do equipamento, TSE cai no de segurança elétrica, único preferencial vivo é usado", () => {
    assert.equal(sugerirPadraoLaudo({ nomesEquipamento: ["Desfibrilador externo"] }, prefs, cands).instrumentoId, "d");
    assert.equal(sugerirPadraoLaudo({ tipoLaudo: "TSE", nomesEquipamento: ["Bomba"] }, prefs, cands).instrumentoId, "s");
    assert.equal(sugerirPadraoLaudo({ nomesEquipamento: ["Bomba"] }, prefs, cands).instrumentoId, null);
    assert.equal(sugerirPadraoLaudo({ nomesEquipamento: ["Bomba"] }, [prefs[0], { tipo: "PNI", instrumentoId: "v" }], cands).instrumentoId, "d");
  });
  it("preferencial com certificado inválido não é sugerido", () => {
    assert.equal(sugerirPadraoLaudo({ nomesEquipamento: ["PNI"] }, [{ tipo: "PNI", instrumentoId: "v" }], cands).instrumentoId, null);
  });
  it("LaudoEditor não tem mais regra própria e chama /instrumentos-padroes/sugestao", () => {
    const src = readFileSync(resolve(__dirname, "../../../web/src/components/shell/editors/LaudoEditor.tsx"), "utf8");
    assert.doesNotMatch(src, /function escolherPreferencial/);
    assert.match(src, /\/instrumentos-padroes\/sugestao\?/);
  });
});

describe("Decisão TL E1 #4 — padrão sem certificado no sino", () => {
  it("gera PADRAO_SEM_CERTIFICADO com link para o padrão, além de vencido/a vencer", () => {
    const itens = montarAlertasPadroes(
      [
        { id: "s", nome: "QA-ES", nSerie: "4", certificadoValidade: null },
        { id: "v", nome: "BP", nSerie: "3", certificadoNumero: "C3", certificadoValidade: "2026-10-01T00:00:00Z" },
      ],
      agora,
    );
    const n = notificacoesPadroes(itens, agora);
    const sem = n.find((x) => x.tipo === "PADRAO_SEM_CERTIFICADO");
    assert.ok(sem);
    assert.equal(sem.href, "/instrumentos/s");
    assert.match(sem.titulo, /sem certificado.*QA-ES \(4\)/);
    assert.equal(n.find((x) => x.id === "padrao-v")?.tipo, "PADRAO_CERTIFICADO_VENCIDO");
  });
  it("o sino (nav.service) usa notificacoesPadroes sem filtrar SEM_CERTIFICADO", () => {
    const src = readFileSync(resolve(__dirname, "../nav/nav.service.ts"), "utf8");
    assert.match(src, /notificacoesPadroes\(/);
    assert.doesNotMatch(src, /SEM_CERTIFICADO"\) continue/);
  });
});
