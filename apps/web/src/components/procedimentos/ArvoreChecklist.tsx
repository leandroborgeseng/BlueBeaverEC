"use client";

/**
 * Árvore do checklist (UX E2 §2): ARIA tree com teclado (↑↓ navega, →/← expande/recolhe,
 * Alt+↑/↓ move, Alt+→ aninha, Alt+← desaninha, Enter abre, Del pede confirmação) e menu ⋮
 * com todas as operações — funciona sem arrastar, por toque e por leitor de tela.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  anunciarPosicao,
  avancar,
  destinosValidos,
  duplicarNo,
  moverCimaBaixo,
  moverPara,
  numerarArvore,
  recuar,
  removerNo,
  type NoArvore,
} from "@aion/shared";
import { alvo44, BORDA_FORTE, botao, campo, FOCO, TEXTO, TEXTO_SUAVE } from "./estilos";

const ROTULO_TIPO: Record<string, string> = {
  MEDICAO: "MEDIÇÃO",
  QUALITATIVA: "QUALITATIVO",
  AMBIENTE: "CONDIÇÕES AMBIENTAIS",
  REGISTRO: "REGISTRO",
};

type Visivel = { no: NoArvore; nivel: number; pos: number; total: number; numero: string };

export function ArvoreChecklist({
  nos,
  onChange,
  selecionado,
  onSelecionar,
  somenteLeitura,
  problemasPorItem,
  novoId,
}: {
  nos: NoArvore[];
  onChange: (nos: NoArvore[]) => void;
  selecionado: string | null;
  onSelecionar: (id: string) => void;
  somenteLeitura: boolean;
  problemasPorItem: Record<string, "aviso" | "bloqueio">;
  novoId: (base: string) => string;
}) {
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [foco, setFoco] = useState<string | null>(nos[0]?.id ?? null);
  const [anuncio, setAnuncio] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [moverDe, setMoverDe] = useState<string | null>(null);
  const refs = useRef<Record<string, HTMLLIElement | null>>({});
  const numeros = useMemo(() => new Map(numerarArvore(nos).map((x) => [x.id, x.numero])), [nos]);

  const visiveis = useMemo(() => {
    const out: Visivel[] = [];
    const v = (ns: NoArvore[], nivel: number) =>
      ns.forEach((n, i) => {
        out.push({ no: n, nivel, pos: i + 1, total: ns.length, numero: numeros.get(n.id) ?? "" });
        if (n.filhos?.length && !fechados.has(n.id)) v(n.filhos, nivel + 1);
      });
    v(nos, 1);
    return out;
  }, [nos, fechados, numeros]);

  useEffect(() => {
    if (foco) refs.current[foco]?.focus();
  }, [foco, nos]);

  const aplicar = (novo: NoArvore[], id: string) => {
    if (novo === nos) {
      setAnuncio("Movimento não permitido aqui (máximo 3 níveis; item não recebe filhos).");
      return;
    }
    onChange(novo);
    setFoco(id);
    setAnuncio(anunciarPosicao(novo, id));
  };

  const excluir = (n: NoArvore) => {
    const msg = n.origem === "pai"
      ? "Este item vem do procedimento-pai. Ocultar neste derivado?"
      : `Excluir "${n.titulo}"${n.filhos?.length ? " e tudo dentro dele" : ""}?`;
    if (window.confirm(msg)) {
      onChange(removerNo(nos, n.id));
      setAnuncio(`${n.titulo} excluído`);
    }
  };

  const onKey = (e: KeyboardEvent, v: Visivel, i: number) => {
    const id = v.no.id;
    const temFilhos = !!v.no.filhos;
    if (e.altKey && !somenteLeitura) {
      if (e.key === "ArrowUp") return e.preventDefault(), aplicar(moverCimaBaixo(nos, id, -1), id);
      if (e.key === "ArrowDown") return e.preventDefault(), aplicar(moverCimaBaixo(nos, id, 1), id);
      if (e.key === "ArrowRight") return e.preventDefault(), aplicar(recuar(nos, id), id);
      if (e.key === "ArrowLeft") return e.preventDefault(), aplicar(avancar(nos, id), id);
    }
    if (e.key === "ArrowDown") return e.preventDefault(), setFoco(visiveis[Math.min(i + 1, visiveis.length - 1)].no.id);
    if (e.key === "ArrowUp") return e.preventDefault(), setFoco(visiveis[Math.max(i - 1, 0)].no.id);
    if (e.key === "Home") return e.preventDefault(), setFoco(visiveis[0].no.id);
    if (e.key === "End") return e.preventDefault(), setFoco(visiveis[visiveis.length - 1].no.id);
    if (e.key === "ArrowRight" && temFilhos) {
      e.preventDefault();
      if (fechados.has(id)) setFechados((s) => new Set([...s].filter((x) => x !== id)));
      else if (v.no.filhos?.length) setFoco(v.no.filhos[0].id);
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (temFilhos && !fechados.has(id)) setFechados((s) => new Set(s).add(id));
      else {
        const pai = visiveis.slice(0, i).reverse().find((x) => x.nivel < v.nivel);
        if (pai) setFoco(pai.no.id);
      }
      return;
    }
    if (e.key === "Enter" || e.key === " ") return e.preventDefault(), onSelecionar(id);
    if ((e.key === "Delete" || e.key === "Backspace") && !somenteLeitura) return e.preventDefault(), excluir(v.no);
  };

  if (!nos.length) {
    return <p style={{ color: TEXTO_SUAVE, padding: 12 }}>Adicione uma seção ou um item para começar.</p>;
  }

  return (
    <div>
      <p id="arvore-ajuda" style={{ fontSize: 12.5, color: TEXTO_SUAVE, margin: "0 0 8px" }}>
        Setas navegam · Enter abre · Alt+↑/↓ move · Alt+→ aninha · Alt+← desaninha · Del exclui. Todas as ações também estão no menu ⋮.
      </p>
      <ul role="tree" aria-label="Checklist do procedimento" aria-describedby="arvore-ajuda" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {visiveis.map((v, i) => {
          const n = v.no;
          const ehSecao = !n.item;
          const prob = problemasPorItem[n.id];
          return (
            <li
              key={n.id}
              ref={(el) => {
                refs.current[n.id] = el;
              }}
              role="treeitem"
              aria-level={v.nivel}
              aria-setsize={v.total}
              aria-posinset={v.pos}
              aria-expanded={ehSecao && n.filhos?.length ? !fechados.has(n.id) : undefined}
              aria-selected={selecionado === n.id}
              tabIndex={foco === n.id ? 0 : -1}
              onKeyDown={(e) => onKey(e, v, i)}
              onFocus={() => setFoco(n.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                minHeight: 44,
                paddingLeft: 8 + (v.nivel - 1) * 20,
                borderBottom: "1px solid oklch(0.92 0.005 250)",
                background: selecionado === n.id ? "oklch(0.95 0.03 255)" : "white",
                outlineColor: FOCO,
                color: TEXTO,
              }}
            >
              {ehSecao ? (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={() => setFechados((s) => (s.has(n.id) ? new Set([...s].filter((x) => x !== n.id)) : new Set(s).add(n.id)))}
                  style={{ ...alvo44, border: "none", background: "transparent", color: TEXTO, cursor: "pointer" }}
                >
                  {fechados.has(n.id) ? "▸" : "▾"}
                </button>
              ) : (
                <span style={{ width: 44 }} aria-hidden="true" />
              )}
              <span
                onClick={() => onSelecionar(n.id)}
                style={{ flex: 1, cursor: "pointer", padding: "10px 0", fontWeight: ehSecao ? 700 : 500, overflowWrap: "anywhere" }}
              >
                {v.numero} {n.titulo}
                {ehSecao && fechados.has(n.id) ? ` (${n.filhos?.length ?? 0} itens)` : ""}
                {n.item ? <span style={{ fontSize: 12, color: TEXTO_SUAVE, marginLeft: 8 }}>{ROTULO_TIPO[n.item.tipo] ?? n.item.tipo}{n.item.pontos?.length ? ` · ${n.item.pontos.length} pontos` : ""}</span> : <span style={{ fontSize: 12, color: TEXTO_SUAVE, marginLeft: 8 }}>(seção)</span>}
                {n.origem === "pai" ? <span style={{ fontSize: 12, marginLeft: 8 }}>↧ herdado do pai{n.sobrescritos?.length ? ` · sobrescrito: ${n.sobrescritos.join(", ")}` : ""}</span> : null}
              </span>
              {prob ? (
                <span role="img" aria-label={prob === "bloqueio" ? "Bloqueio" : "Aviso"} title={prob === "bloqueio" ? "Bloqueio" : "Aviso"} style={{ fontWeight: 700 }}>
                  {prob === "bloqueio" ? "⛔" : "⚠"}
                </span>
              ) : null}
              {!somenteLeitura && (
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-haspopup="menu"
                    aria-expanded={menu === n.id}
                    aria-label={`Ações de ${n.titulo}`}
                    onClick={() => setMenu(menu === n.id ? null : n.id)}
                    style={{ ...alvo44, border: `1px solid ${BORDA_FORTE}`, borderRadius: 7, background: "white", color: TEXTO, cursor: "pointer" }}
                  >
                    ⋮
                  </button>
                  {menu === n.id && (
                    <div role="menu" aria-label={`Ações de ${n.titulo}`} style={{ position: "absolute", right: 0, top: 46, zIndex: 20, background: "white", border: `1px solid ${BORDA_FORTE}`, borderRadius: 8, minWidth: 220, boxShadow: "0 6px 20px rgba(0,0,0,0.12)" }}>
                      {(
                        [
                          ["Mover para cima", () => aplicar(moverCimaBaixo(nos, n.id, -1), n.id)],
                          ["Mover para baixo", () => aplicar(moverCimaBaixo(nos, n.id, 1), n.id)],
                          ["Recuar (aninhar)", () => aplicar(recuar(nos, n.id), n.id)],
                          ["Avançar (desaninhar)", () => aplicar(avancar(nos, n.id), n.id)],
                          ["Mover para…", () => setMoverDe(n.id)],
                          ["Duplicar", () => onChange(duplicarNo(nos, n.id, novoId))],
                          [n.origem === "pai" ? "Ocultar neste derivado" : "Excluir", () => excluir(n)],
                        ] as Array<[string, () => void]>
                      ).map(([r, fn]) => (
                        <button
                          key={r}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMenu(null);
                            fn();
                          }}
                          style={{ display: "block", width: "100%", minHeight: 44, textAlign: "left", padding: "10px 14px", border: "none", background: "white", color: TEXTO, cursor: "pointer", fontSize: 14 }}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {moverDe && (
        <div role="dialog" aria-modal="true" aria-labelledby="mover-titulo" style={{ marginTop: 12, padding: 12, border: `1px solid ${BORDA_FORTE}`, borderRadius: 8 }}>
          <h3 id="mover-titulo" style={{ fontSize: 15, margin: "0 0 8px" }}>Mover para…</h3>
          <select
            autoFocus
            aria-label="Destino"
            style={campo}
            defaultValue=""
            onChange={(e) => {
              const destino = e.target.value === "__raiz" ? null : e.target.value;
              if (!e.target.value) return;
              aplicar(moverPara(nos, moverDe, destino), moverDe);
              setMoverDe(null);
            }}
          >
            <option value="">Escolha o destino</option>
            {destinosValidos(nos, moverDe).map((d) => (
              <option key={d.id ?? "__raiz"} value={d.id ?? "__raiz"}>
                {"— ".repeat(d.nivel)}
                {d.titulo}
              </option>
            ))}
          </select>
          <button type="button" style={{ ...botao(), marginTop: 8 }} onClick={() => setMoverDe(null)}>
            Cancelar
          </button>
        </div>
      )}
      <div aria-live="polite" role="status" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {anuncio}
      </div>
    </div>
  );
}
