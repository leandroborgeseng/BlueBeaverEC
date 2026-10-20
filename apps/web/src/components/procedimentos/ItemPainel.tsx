"use client";

/** Painel do item (UX E2 §2): campos por tipo, pontos com limite por ponto e exemplo ao vivo. */
import { useId } from "react";
import { textoLimitePonto, MSG_B10, type ItemProcedimento, type LimitePonto, type NoArvore, type PontoMedicao } from "@aion/shared";
import { ajuda, botao, campo, grade, rotulo, TEXTO_SUAVE } from "./estilos";

const LIMITES: Array<[LimitePonto["tipo"], string]> = [
  ["INTERVALO", "Intervalo (mín e máx)"],
  ["NOM_ABS", "Nominal ± absoluto"],
  ["NOM_PCT", "Nominal ± %"],
  ["MAX_LE", "Só máximo (≤)"],
  ["MAX_LT", "Só máximo estrito (<)"],
  ["MIN_GE", "Só mínimo (≥)"],
  ["SEM_LIMITE", "Sem limite (não avaliado)"],
];

function Radios<T extends string>({ nome, legenda, valor, opcoes, onChange, desabilitado, descricao }: {
  nome: string; legenda: string; valor: T | undefined; opcoes: Array<[T, string]>; onChange: (v: T) => void; desabilitado?: boolean; descricao?: string;
}) {
  const id = useId();
  return (
    <fieldset style={{ border: "none", padding: 0, margin: 0 }} aria-describedby={descricao ? `${id}-d` : undefined}>
      <legend style={rotulo}>{legenda}</legend>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {opcoes.map(([v, r]) => (
          <label key={v} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 10px 0 0", fontSize: 14 }}>
            <input type="radio" name={`${nome}-${id}`} value={v} checked={valor === v} disabled={desabilitado} onChange={() => onChange(v)} style={{ width: 20, height: 20 }} />
            {r}
          </label>
        ))}
      </div>
      {descricao ? <p id={`${id}-d`} style={ajuda}>{descricao}</p> : null}
    </fieldset>
  );
}

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export function ItemPainel({ no, onChange, somenteLeitura, problemas, novoId }: {
  no: NoArvore;
  onChange: (n: NoArvore) => void;
  somenteLeitura: boolean;
  problemas: string[];
  novoId: (b: string) => string;
}) {
  const id = useId();
  const it = no.item;
  const ro = somenteLeitura;
  if (!it) {
    return (
      <div>
        <label htmlFor={`${id}-t`} style={rotulo}>Título da seção*</label>
        <input id={`${id}-t`} style={campo} value={no.titulo} disabled={ro} onChange={(e) => onChange({ ...no, titulo: e.target.value })} />
      </div>
    );
  }
  const set = (p: Partial<ItemProcedimento>) => onChange({ ...no, titulo: p.titulo ?? no.titulo, item: { ...it, ...p } });
  const setPonto = (i: number, p: Partial<PontoMedicao>) => set({ pontos: (it.pontos ?? []).map((x, j) => (j === i ? { ...x, ...p } : x)) });
  const erroId = `${id}-erros`;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {problemas.length > 0 && (
        <ul id={erroId} style={{ margin: 0, paddingLeft: 18, fontSize: 13.5 }}>
          {problemas.map((p) => (
            <li key={p}>{p.includes("bloque") || p.includes(MSG_B10) || /Informe|Escolha|Mínimo maior/.test(p) ? "⛔ " : "⚠ "}{p}</li>
          ))}
        </ul>
      )}
      <div style={grade}>
        <div>
          <label htmlFor={`${id}-t`} style={rotulo}>Título do item*</label>
          <input id={`${id}-t`} style={campo} value={it.titulo} disabled={ro} aria-describedby={problemas.length ? erroId : undefined} onChange={(e) => set({ titulo: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-tipo`} style={rotulo}>Tipo*</label>
          <select id={`${id}-tipo`} style={campo} value={it.tipo} disabled={ro} onChange={(e) => set({ tipo: e.target.value as ItemProcedimento["tipo"] })}>
            <option value="MEDICAO">Medição</option>
            <option value="QUALITATIVA">Verificação qualitativa</option>
            <option value="AMBIENTE">Condições ambientais</option>
            <option value="REGISTRO">Registro</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-instr`} style={rotulo}>Instruções</label>
        <textarea id={`${id}-instr`} style={{ ...campo, minHeight: 70 }} value={it.instrucoes ?? ""} disabled={ro} onChange={(e) => set({ instrucoes: e.target.value })} />
      </div>

      {it.tipo === "MEDICAO" && (
        <>
          <div style={grade}>
            <div><label htmlFor={`${id}-g`} style={rotulo}>Grandeza</label><input id={`${id}-g`} style={campo} value={it.grandeza ?? ""} disabled={ro} onChange={(e) => set({ grandeza: e.target.value })} /></div>
            <div><label htmlFor={`${id}-u`} style={rotulo}>Unidade*</label><input id={`${id}-u`} style={campo} value={it.unidade ?? ""} disabled={ro} aria-invalid={!it.unidade?.trim()} aria-describedby={!it.unidade?.trim() ? `${id}-u-e` : undefined} onChange={(e) => set({ unidade: e.target.value })} />{!it.unidade?.trim() && <p id={`${id}-u-e`} style={ajuda}>⛔ Informe a unidade.</p>}</div>
            <div><label htmlFor={`${id}-tp`} style={rotulo}>Tipo de padrão exigido*</label><input id={`${id}-tp`} style={campo} value={it.tipoPadrao ?? ""} disabled={ro} aria-invalid={!it.tipoPadrao?.trim()} aria-describedby={!it.tipoPadrao?.trim() ? `${id}-tp-e` : undefined} onChange={(e) => set({ tipoPadrao: e.target.value })} />{!it.tipoPadrao?.trim() && <p id={`${id}-tp-e`} style={ajuda}>⛔ Escolha o tipo de padrão.</p>}</div>
            <div><label htmlFor={`${id}-r`} style={rotulo}>Resolução / MDE</label><input id={`${id}-r`} inputMode="decimal" style={campo} value={it.resolucao ?? ""} disabled={ro} onChange={(e) => set({ resolucao: num(e.target.value) })} /></div>
            <div><label htmlFor={`${id}-n`} style={rotulo}>Nº de leituras por ponto</label><input id={`${id}-n`} type="number" min={1} style={campo} value={it.nLeituras ?? 1} disabled={ro} onChange={(e) => set({ nLeituras: Math.max(1, Number(e.target.value) || 1) })} /></div>
            <div><label htmlFor={`${id}-o`} style={rotulo}>Ordem de medição</label>
              <select id={`${id}-o`} style={campo} value={it.ordem ?? "CRESCENTE"} disabled={ro} onChange={(e) => set({ ordem: e.target.value as ItemProcedimento["ordem"] })}>
                <option value="CRESCENTE">Crescente</option><option value="DECRESCENTE">Decrescente</option><option value="AMBAS">Ambas</option>
              </select></div>
          </div>
          <Radios nome="leitura" legenda="Leitura" valor={it.leitura ?? "DIGITAL"} opcoes={[["DIGITAL", "Digital"], ["ANALOGICA", "Analógica"]]} desabilitado={ro} onChange={(v) => set({ leitura: v })} />
          <div style={grade}>
            <div><label htmlFor={`${id}-ref`} style={rotulo}>Referência da tolerância</label><input id={`${id}-ref`} style={campo} value={it.tolerancia?.referencia ?? ""} disabled={ro} onChange={(e) => set({ tolerancia: { ...it.tolerancia, referencia: e.target.value } })} /><p style={ajuda}>Sem referência a medição fica NÃO AVALIADO no laudo.</p></div>
            <div><label htmlFor={`${id}-ver`} style={rotulo}>Versão da referência</label><input id={`${id}-ver`} style={campo} value={it.tolerancia?.versao ?? ""} disabled={ro} onChange={(e) => set({ tolerancia: { ...it.tolerancia, versao: e.target.value } })} /></div>
          </div>
          <Radios
            nome="regra"
            legenda="Regra de decisão"
            valor={it.regra ?? "DIRETA"}
            opcoes={[["DIRETA", "Direta — compara a média com o limite"], ["CONSIDERANDO_U", "Considerando U — aprova só se média ± U ficar dentro; senão pode dar INCONCLUSIVO"]]}
            desabilitado={ro}
            onChange={(v) => set({ regra: v })}
          />
          {(it.regra ?? "DIRETA") === "CONSIDERANDO_U" && (
            <div>
              <label htmlFor={`${id}-mu`} style={rotulo}>Modelo de incerteza vinculado*</label>
              <input id={`${id}-mu`} style={campo} value={it.incertezaModeloId ?? ""} disabled={ro} aria-invalid={!it.incertezaModeloId} aria-describedby={!it.incertezaModeloId ? `${id}-mu-e` : undefined} onChange={(e) => set({ incertezaModeloId: e.target.value || null })} />
              {!it.incertezaModeloId && <p id={`${id}-mu-e`} style={ajuda}>⛔ {MSG_B10}</p>}
            </div>
          )}

          <h4 style={{ margin: "6px 0 0", fontSize: 15 }}>Pontos</h4>
          {(it.pontos ?? []).map((p, i) => (
            <fieldset key={p.id} style={{ border: "1px solid oklch(0.85 0.01 250)", borderRadius: 8, padding: 12, display: "grid", gap: 10 }}>
              <legend style={{ fontWeight: 700, fontSize: 14 }}>Ponto {i + 1}: {p.nominal} {it.unidade}</legend>
              <div style={grade}>
                <div><label htmlFor={`${id}-pn${i}`} style={rotulo}>Valor nominal*</label><input id={`${id}-pn${i}`} inputMode="decimal" style={campo} value={p.nominal} disabled={ro} onChange={(e) => setPonto(i, { nominal: num(e.target.value) ?? 0 })} /></div>
                {["INTERVALO", "NOM_ABS", "NOM_PCT", "MIN_GE"].includes(p.limite.tipo) && (
                  <div><label htmlFor={`${id}-pa${i}`} style={rotulo}>{p.limite.tipo === "INTERVALO" || p.limite.tipo === "MIN_GE" ? "Mínimo" : p.limite.tipo === "NOM_PCT" ? "Tolerância (%)" : "Tolerância (±)"}</label><input id={`${id}-pa${i}`} inputMode="decimal" style={campo} value={p.limite.a ?? ""} disabled={ro} onChange={(e) => setPonto(i, { limite: { ...p.limite, a: num(e.target.value) } })} /></div>
                )}
                {["INTERVALO", "MAX_LE", "MAX_LT"].includes(p.limite.tipo) && (
                  <div><label htmlFor={`${id}-pb${i}`} style={rotulo}>Máximo</label><input id={`${id}-pb${i}`} inputMode="decimal" style={campo} value={p.limite.b ?? ""} disabled={ro} onChange={(e) => setPonto(i, { limite: { ...p.limite, b: num(e.target.value) } })} /></div>
                )}
              </div>
              <Radios
                nome={`lim${i}`}
                legenda="Tipo de limite"
                valor={p.limite.tipo}
                opcoes={LIMITES}
                desabilitado={ro}
                onChange={(v) => setPonto(i, { limite: { tipo: v, a: v.startsWith("MAX") ? null : p.limite.a, b: v === "MIN_GE" || v.startsWith("NOM") ? null : p.limite.b } })}
                descricao={p.limite.tipo.startsWith("MAX") ? "Só o máximo é comparado. Zero não é tratado como limite inferior." : undefined}
              />
              <p aria-live="polite" style={{ margin: 0, fontWeight: 600 }}>{textoLimitePonto(p.limite, p.nominal, it.unidade)}</p>
              <Radios
                nome={`base${i}`}
                legenda="Base do limite e do erro"
                valor={p.base ?? "NOMINAL"}
                opcoes={[["NOMINAL", "Valor nominal"], ["VVC", "Valor convencional do padrão"]]}
                desabilitado={ro}
                onChange={(v) => setPonto(i, { base: v })}
                descricao="O erro exibido no laudo usa a mesma base do limite."
              />
              {!ro && <button type="button" style={botao("secundario")} onClick={() => set({ pontos: (it.pontos ?? []).filter((_, j) => j !== i) })}>Remover ponto</button>}
            </fieldset>
          ))}
          {!ro && (
            <button type="button" style={botao()} onClick={() => set({ pontos: [...(it.pontos ?? []), { id: novoId("p"), nominal: 0, limite: { tipo: "NOM_ABS", a: null } }] })}>
              + Ponto
            </button>
          )}
        </>
      )}

      {it.tipo === "QUALITATIVA" && (
        <>
          <h4 style={{ margin: 0, fontSize: 15 }}>Subitens (Passa / Falha / N/A)</h4>
          {(it.subitens ?? []).map((s, i) => (
            <div key={s.id} style={grade}>
              <div><label htmlFor={`${id}-s${i}`} style={rotulo}>Subitem {i + 1}</label><input id={`${id}-s${i}`} style={campo} value={s.texto} disabled={ro} onChange={(e) => set({ subitens: (it.subitens ?? []).map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)) })} /></div>
              <div><label htmlFor={`${id}-si${i}`} style={rotulo}>Instrução</label><input id={`${id}-si${i}`} style={campo} value={s.instrucao ?? ""} disabled={ro} onChange={(e) => set({ subitens: (it.subitens ?? []).map((x, j) => (j === i ? { ...x, instrucao: e.target.value } : x)) })} /></div>
            </div>
          ))}
          {!ro && <button type="button" style={botao()} onClick={() => set({ subitens: [...(it.subitens ?? []), { id: novoId("s"), texto: "" }] })}>+ Subitem</button>}
        </>
      )}

      {it.tipo === "AMBIENTE" && (
        <div style={grade}>
          {([["tMin", "Temperatura mín (°C)"], ["tMax", "Temperatura máx (°C)"], ["urMin", "Umidade mín (%UR)"], ["urMax", "Umidade máx (%UR)"]] as const).map(([k, r]) => (
            <div key={k}><label htmlFor={`${id}-${k}`} style={rotulo}>{r}</label><input id={`${id}-${k}`} inputMode="decimal" style={campo} value={it[k] ?? ""} disabled={ro} onChange={(e) => set({ [k]: num(e.target.value) } as Partial<ItemProcedimento>)} /></div>
          ))}
        </div>
      )}

      {it.tipo === "REGISTRO" && (
        <div>
          <label htmlFor={`${id}-ru`} style={rotulo}>Unidade</label>
          <input id={`${id}-ru`} style={campo} value={it.unidade ?? ""} disabled={ro} onChange={(e) => set({ unidade: e.target.value })} />
          <p style={{ ...ajuda, color: TEXTO_SUAVE }}>Registro é informativo: sai como NÃO APLICA e não reprova.</p>
        </div>
      )}
    </div>
  );
}
