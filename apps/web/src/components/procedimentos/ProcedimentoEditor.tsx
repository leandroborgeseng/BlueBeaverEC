"use client";

/**
 * Editor estruturado de procedimento (E2, UX e2-editor-procedimento.md). Substitui o JSON cru.
 * Rascunho com autosave (5 s) e token de concorrência; publicado é somente leitura; publicar exige
 * a permissão especial procedimento.publicar (Q1).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  avisoTituloIncoerente,
  inserirNo,
  atualizarNo,
  itensDaArvore,
  localizarNo,
  rotuloProcedimento,
  type ArvoreProcedimento,
  type CertificadoCfg,
  type NoArvore,
  type Sobrescrita,
} from "@aion/shared";
import { api } from "@/lib/api";
import { ArvoreChecklist } from "./ArvoreChecklist";
import { ItemPainel } from "./ItemPainel";
import { ajuda, alvo44, BORDA_FORTE, botao, campo, grade, rotulo, TEXTO, TEXTO_SUAVE } from "./estilos";

type Versao = {
  id: string;
  versao: number;
  status: "RASCUNHO" | "PUBLICADO" | "ARQUIVADO" | null;
  codigo: string | null;
  tituloLaudo: string | null;
  tipo: string;
  tipoDocumento: "LAUDO" | "CERTIFICADO" | null;
  generico: boolean | null;
  validadeMeses: number;
  norma: string | null;
  paiId: string | null;
  arvore: ArvoreProcedimento | null;
  itensResolvidos?: { arvore?: ArvoreProcedimento } | null;
  certificadoCfg: CertificadoCfg | null;
  criterioReferencia: string | null;
  criterioVersao: string | null;
  publicadoEm: string | null;
  publicadoPorNome: string | null;
  atualizadoEm: string | null;
  createdByNome?: string | null;
};
type Detalhe = {
  id: string;
  nome: string;
  codigo: string | null;
  tipo: string;
  paiId: string | null;
  versaoPublicada: Versao | null;
  rascunho: Versao | null;
  historico: Versao[];
  avisos: string[];
  modelos: Array<{ modelo: { nome: string; fabricante?: { nome: string } } }>;
};
type Previa = { bloqueios: string[]; avisos: string[] };
type ProcResumo = { id: string; rotulo: string; versaoPublicadaId: string | null };

const ABAS = ["Geral", "Checklist", "Certificado", "Anexos", "Bibliografia", "Versões"] as const;
const TIPOS = [["RECEBIMENTO", "Recebimento"], ["PREVENTIVA", "Preventiva"], ["CALIBRACAO", "Calibração"], ["TSE", "TSE"], ["QUALIFICACAO", "Qualificação"]];
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
let seq = 0;
const novoId = (base: string) => `${base}-${Date.now().toString(36)}${(seq++).toString(36)}`;

function Chip({ v }: { v: Versao | null }) {
  if (!v) return null;
  const [icone, texto] =
    v.status === "RASCUNHO" ? ["✎", "Rascunho"] : v.status === "ARQUIVADO" ? ["⧗", "Arquivado"] : ["✓", `Publicado v${v.versao}${v.publicadoEm ? ` em ${fmt(v.publicadoEm)}` : ""}`];
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", border: `1px solid ${BORDA_FORTE}`, borderRadius: 999, padding: "4px 10px", fontSize: 13, fontWeight: 600, color: TEXTO }}>
      <span aria-hidden="true">{icone}</span>
      {texto}
    </span>
  );
}

export function ProcedimentoEditor({ procId, podePublicar, podeAprovar, onFechar }: { procId: string; podePublicar: boolean; podeAprovar: boolean; onFechar: () => void }) {
  const [det, setDet] = useState<Detalhe | null>(null);
  const [v, setV] = useState<Versao | null>(null);
  const [aba, setAba] = useState<(typeof ABAS)[number]>("Geral");
  const [sel, setSel] = useState<string | null>(null);
  const [sujo, setSujo] = useState(false);
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [conflito, setConflito] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [diff, setDiff] = useState<{ cabecalho: string[]; incluidos: string[]; removidos: string[]; alterados: string[] } | null>(null);
  const [paiArvore, setPaiArvore] = useState<ArvoreProcedimento | null>(null);
  const [procs, setProcs] = useState<ProcResumo[]>([]);
  const abasRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ro = v?.status !== "RASCUNHO";

  const carregar = useCallback(async () => {
    const d = await api<Detalhe>(`/procedimentos-laudo/${procId}`);
    setDet(d);
    const alvo = d.rascunho ?? d.versaoPublicada ?? d.historico[0] ?? null;
    setV(alvo ? await api<Versao>(`/procedimentos-laudo/${procId}/versoes/${alvo.id}`) : null);
    setSujo(false);
    setConflito(null);
  }, [procId]);

  useEffect(() => {
    void carregar().catch((e) => setErro(e.message));
    void api<ProcResumo[]>("/procedimentos-laudo").then(setProcs).catch(() => undefined);
  }, [carregar]);

  useEffect(() => {
    if (!v?.paiId) return setPaiArvore(null);
    void api<Detalhe>(`/procedimentos-laudo/${v.paiId}`)
      .then((p) => setPaiArvore(p.versaoPublicada ? (p.versaoPublicada as Versao).itensResolvidos?.arvore ?? null : null))
      .catch(() => setPaiArvore(null));
  }, [v?.paiId]);

  const validar = useCallback(async () => {
    if (!v) return;
    setPrevia(await api<Previa>(`/procedimentos-laudo/${procId}/versoes/${v.id}/validacao`).catch(() => null));
  }, [procId, v]);

  const salvar = useCallback(async () => {
    if (!v || ro || !sujo) return;
    try {
      const r = await api<Versao & { avisos: string[] }>(`/procedimentos-laudo/${procId}/versoes/${v.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          atualizadoEm: v.atualizadoEm,
          codigo: v.codigo ?? "",
          tituloLaudo: v.tituloLaudo ?? "",
          ...(v.tipoDocumento ? { tipoDocumento: v.tipoDocumento } : {}),
          generico: !!v.generico,
          validadeMeses: v.validadeMeses,
          norma: v.norma ?? "",
          paiId: v.paiId ?? "",
          arvore: v.arvore ?? { nos: [] },
          certificadoCfg: v.certificadoCfg ?? {},
          ...(podeAprovar ? { criterioReferencia: v.criterioReferencia ?? "", criterioVersao: v.criterioVersao ?? "" } : {}),
        }),
      });
      setV((x) => (x ? { ...x, atualizadoEm: r.atualizadoEm } : x));
      setSujo(false);
      setSalvoEm(new Date());
      setErro(null);
      void validar();
    } catch (e) {
      const m = e instanceof Error ? e.message : "Erro";
      if (/alterado por outra pessoa/.test(m)) setConflito("Este rascunho foi alterado por outra pessoa. Recarregue para ver a versão atual.");
      else setErro(`Não foi possível salvar. Suas alterações estão neste navegador; tente de novo. (${m})`);
    }
  }, [procId, v, ro, sujo, podeAprovar, validar]);

  // autosave 5 s após parar de digitar
  useEffect(() => {
    if (!sujo || conflito) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void salvar(), 5000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [sujo, conflito, salvar]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (sujo) {
        e.preventDefault();
        e.returnValue = "Você tem alterações não salvas no rascunho.";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sujo]);

  useEffect(() => {
    if (v?.status === "RASCUNHO") void validar();
  }, [v?.id, v?.status, validar]);

  const mudar = (p: Partial<Versao>) => {
    setV((x) => (x ? { ...x, ...p } : x));
    setSujo(true);
  };
  const nos = v?.arvore?.nos ?? [];
  const setNos = (n: NoArvore[]) => mudar({ arvore: { ...(v?.arvore ?? {}), nos: n } });
  const cfg = v?.certificadoCfg ?? {};
  const setCfg = (p: Partial<CertificadoCfg>) => mudar({ certificadoCfg: { ...cfg, ...p } });
  const heranca = v?.arvore?.heranca ?? {};
  const setHeranca = (h: ArvoreProcedimento["heranca"]) => mudar({ arvore: { nos, heranca: h } });

  const problemasPorItem = useMemo(() => {
    const m: Record<string, "aviso" | "bloqueio"> = {};
    for (const it of itensDaArvore(nos)) {
      const ehB = (previa?.bloqueios ?? []).some((b) => b.startsWith(`${it.titulo}:`) || b.startsWith(`${it.titulo},`));
      const ehA = (previa?.avisos ?? []).some((a) => a.startsWith(`${it.titulo}:`) || (it.pontos ?? []).some((p) => a.startsWith(`Ponto ${p.nominal}`)));
      if (ehB) m[it.id] = "bloqueio";
      else if (ehA) m[it.id] = "aviso";
    }
    return m;
  }, [nos, previa]);

  const fechar = async () => {
    if (sujo) {
      const r = window.confirm("Você tem alterações não salvas no rascunho. Salvar antes de sair?");
      if (r) await salvar();
      else if (!window.confirm("Descartar as alterações?")) return;
    }
    onFechar();
  };

  const editar = async () => {
    try {
      await api(`/procedimentos-laudo/${procId}/rascunho`, { method: "POST" });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  };

  const abrirPublicar = async () => {
    await salvar();
    await validar();
    if (det?.versaoPublicada && v) {
      setDiff(await api<typeof diff>(`/procedimentos-laudo/${procId}/diff?de=${det.versaoPublicada.id}&para=${v.id}`).catch(() => null));
    } else setDiff(null);
    setDialogo(true);
  };

  const publicar = async () => {
    if (!v) return;
    try {
      await api(`/procedimentos-laudo/${procId}/versoes/${v.id}/publicar`, { method: "POST", body: JSON.stringify({ confirmarAvisos: true }) });
      setDialogo(false);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  };

  const onKeyAbas = (e: KeyboardEvent) => {
    const i = ABAS.indexOf(aba);
    const j = e.key === "ArrowRight" ? (i + 1) % ABAS.length : e.key === "ArrowLeft" ? (i - 1 + ABAS.length) % ABAS.length : e.key === "Home" ? 0 : e.key === "End" ? ABAS.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    setAba(ABAS[j]);
    abasRef.current[ABAS[j]]?.focus();
  };

  if (erro && !det) return <p role="alert">{erro}</p>;
  if (!det || !v) return <p aria-busy="true">Carregando procedimento…</p>;

  const noSel = sel ? (() => { const l = localizarNo(nos, sel); return l ? l.irmaos[l.indice] : null; })() : null;
  const problemasSel = noSel?.item
    ? [...(previa?.bloqueios ?? []), ...(previa?.avisos ?? [])].filter((p) => p.startsWith(`${noSel.item!.titulo}`) || (noSel.item!.pontos ?? []).some((pt) => p.startsWith(`Ponto ${pt.nominal}`)))
    : [];
  const nProblemas = (previa?.bloqueios.length ?? 0) + (previa?.avisos.length ?? 0);
  const avisoTitulo = avisoTituloIncoerente(v.tipoDocumento, cfg.tituloImpresso);
  const pai = procs.find((p) => p.id === v.paiId);

  return (
    <section aria-labelledby="ed-titulo" style={{ color: TEXTO }}>
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "white", borderBottom: `1px solid ${BORDA_FORTE}`, padding: "10px 0", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <h2 id="ed-titulo" style={{ margin: 0, fontSize: 18, flex: "1 1 260px", overflowWrap: "anywhere" }}>
          {v.codigo || "SEM CÓDIGO"} – {v.tituloLaudo || det.nome} · v{v.versao}
        </h2>
        <Chip v={v} />
        {!ro && <span role="status" style={{ fontSize: 13, color: TEXTO_SUAVE }}>{sujo ? "Alterações não salvas" : salvoEm ? `Salvo às ${hora(salvoEm)}` : ""}</span>}
        {nProblemas > 0 && !ro && (
          <button type="button" style={botao()} onClick={() => setAba("Checklist")}>
            Problemas ({nProblemas})
          </button>
        )}
        {!ro && <button type="button" style={botao()} onClick={() => void salvar()} disabled={!sujo}>Salvar rascunho</button>}
        {!ro && (
          <button type="button" style={botao("primario", !podePublicar)} disabled={!podePublicar} aria-describedby={!podePublicar ? "pub-sem-perm" : undefined} onClick={() => void abrirPublicar()}>
            Publicar…
          </button>
        )}
        {ro && <button type="button" style={botao("primario")} onClick={() => void editar()}>Editar (cria v{Math.max(...det.historico.map((h) => h.versao), v.versao) + 1} em rascunho)</button>}
        <button type="button" style={botao()} onClick={() => void fechar()}>Fechar</button>
        {!podePublicar && !ro && <p id="pub-sem-perm" style={{ ...ajuda, flexBasis: "100%" }}>Publicar exige a permissão especial “Publicar procedimentos”, concedida pelo administrador.</p>}
      </header>

      {ro && v.status === "PUBLICADO" && (
        <p style={{ border: `1px solid ${BORDA_FORTE}`, borderRadius: 8, padding: 10 }}>
          ✓ Versão publicada em {fmt(v.publicadoEm)}{v.publicadoPorNome ? ` por ${v.publicadoPorNome}` : ""}. Alterações criam uma nova versão; laudos emitidos não mudam.
        </p>
      )}
      {det.avisos.map((a) => (
        <p key={a} role="note" style={{ border: `1px solid ${BORDA_FORTE}`, borderRadius: 8, padding: 10 }}>⚠ {a}. Este procedimento continua na versão do pai que usou; republique para adotar a nova.</p>
      ))}
      {conflito && (
        <div role="alert" style={{ border: `2px solid var(--aion-danger)`, borderRadius: 8, padding: 10, margin: "8px 0" }}>
          ⛔ {conflito} <button type="button" style={botao()} onClick={() => void carregar()}>Recarregar</button>
        </div>
      )}
      {erro && det && (
        <div role="alert" style={{ border: `2px solid var(--aion-danger)`, borderRadius: 8, padding: 10, margin: "8px 0" }}>
          ⛔ {erro} <button type="button" style={botao()} onClick={() => void salvar()}>Tentar de novo</button>
        </div>
      )}

      <div role="tablist" aria-label="Seções do procedimento" onKeyDown={onKeyAbas} style={{ display: "flex", flexWrap: "wrap", gap: 4, margin: "12px 0", borderBottom: `1px solid ${BORDA_FORTE}` }}>
        {ABAS.map((a) => (
          <button
            key={a}
            ref={(el) => {
              abasRef.current[a] = el;
            }}
            id={`aba-${a}`}
            role="tab"
            type="button"
            aria-selected={aba === a}
            aria-controls={`painel-${a}`}
            tabIndex={aba === a ? 0 : -1}
            onClick={() => setAba(a)}
            style={{ ...alvo44, padding: "8px 14px", border: "none", borderBottom: aba === a ? "3px solid var(--aion-brand)" : "3px solid transparent", background: "white", fontWeight: aba === a ? 700 : 500, color: TEXTO, cursor: "pointer", fontSize: 14 }}
          >
            {a}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`aba-${aba}`} tabIndex={0}>
        {aba === "Geral" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={grade}>
              <div><label htmlFor="g-cod" style={rotulo}>Código*</label><input id="g-cod" style={campo} value={v.codigo ?? ""} disabled={ro} onChange={(e) => mudar({ codigo: e.target.value })} /></div>
              <div><label htmlFor="g-tit" style={rotulo}>Título do laudo*</label><input id="g-tit" style={campo} value={v.tituloLaudo ?? ""} disabled={ro} onChange={(e) => mudar({ tituloLaudo: e.target.value })} /></div>
              <div><label htmlFor="g-tipo" style={rotulo}>Tipo*</label>
                <select id="g-tipo" style={campo} value={v.tipo} disabled>
                  {TIPOS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
                </select>
                <p style={ajuda}>O tipo é definido na criação.</p></div>
              <div><label htmlFor="g-val" style={rotulo}>Validade em meses*</label><input id="g-val" type="number" min={1} style={campo} value={v.validadeMeses} disabled={ro} onChange={(e) => mudar({ validadeMeses: Math.max(1, Number(e.target.value) || 1) })} /></div>
              <div><label htmlFor="g-norma" style={rotulo}>Norma / referência</label><input id="g-norma" style={campo} value={v.norma ?? ""} disabled={ro} onChange={(e) => mudar({ norma: e.target.value })} /></div>
              <div><label htmlFor="g-pai" style={rotulo}>Procedimento-pai (herança)</label>
                <select id="g-pai" style={campo} value={v.paiId ?? ""} disabled={ro} onChange={(e) => mudar({ paiId: e.target.value || null })}>
                  <option value="">Nenhum</option>
                  {procs.filter((p) => p.id !== procId && p.versaoPublicadaId).map((p) => <option key={p.id} value={p.id}>{p.rotulo}</option>)}
                </select>
                <p style={ajuda}>Herança até 3 níveis. O derivado fica na versão do pai usada até ser republicado.</p></div>
            </div>
            <fieldset style={{ border: "none", padding: 0 }} aria-describedby="g-doc-ajuda">
              <legend style={rotulo}>Documento emitido*</legend>
              {(["LAUDO", "CERTIFICADO"] as const).map((d) => (
                <label key={d} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, marginRight: 16, fontSize: 14 }}>
                  <input type="radio" name="g-doc" checked={v.tipoDocumento === d} disabled={ro} onChange={() => mudar({ tipoDocumento: d })} style={{ width: 20, height: 20 }} />
                  {d === "LAUDO" ? "Laudo" : "Certificado"}
                </label>
              ))}
              <p id="g-doc-ajuda" style={ajuda}>Certificado de calibração só deve ser escolhido com aval do responsável técnico. Laudos já emitidos mantêm o tipo da versão em que foram feitos.</p>
            </fieldset>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, fontSize: 14 }}>
              <input type="checkbox" role="switch" aria-checked={!!v.generico} checked={!!v.generico} disabled={ro} onChange={(e) => mudar({ generico: e.target.checked })} style={{ width: 20, height: 20 }} />
              Procedimento genérico
            </label>
            <div style={grade}>
              <div><label htmlFor="g-cref" style={rotulo}>Critério de aceitação — referência</label><input id="g-cref" style={campo} value={v.criterioReferencia ?? ""} disabled={ro || !podeAprovar} onChange={(e) => mudar({ criterioReferencia: e.target.value })} /></div>
              <div><label htmlFor="g-cver" style={rotulo}>Critério — versão</label><input id="g-cver" style={campo} value={v.criterioVersao ?? ""} disabled={ro || !podeAprovar} onChange={(e) => mudar({ criterioVersao: e.target.value })} /></div>
            </div>
            {!podeAprovar && <p style={ajuda}>Critério de aceitação: só quem tem aprovação em Laudos edita.</p>}
            <div>
              <h3 style={{ fontSize: 15, margin: "6px 0" }}>Modelos de equipamento vinculados</h3>
              {det.modelos.length ? <ul>{det.modelos.map((m, i) => <li key={i}>{m.modelo.fabricante?.nome} · {m.modelo.nome}</li>)}</ul> : <p style={ajuda}>Nenhum. Vincule depois de publicar.</p>}
            </div>
          </div>
        )}

        {aba === "Checklist" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 360px", minWidth: 0 }}>
              {!ro && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  <button type="button" style={botao()} onClick={() => { const id = novoId("sec"); setNos(inserirNo(nos, null, { id, titulo: "Nova seção", filhos: [] })); setSel(id); }}>+ Seção</button>
                  <button
                    type="button"
                    style={botao()}
                    onClick={() => {
                      const id = novoId("item");
                      const destino = noSel && !noSel.item ? noSel.id : null;
                      const novo: NoArvore = { id, titulo: "Novo item", item: { id, tipo: "QUALITATIVA", titulo: "Novo item", subitens: [] } };
                      const r = inserirNo(nos, destino, novo);
                      setNos(r === nos ? inserirNo(nos, null, novo) : r);
                      setSel(id);
                    }}
                  >
                    + Item{noSel && !noSel.item ? ` em ${noSel.titulo}` : ""}
                  </button>
                </div>
              )}
              <ArvoreChecklist nos={nos} onChange={setNos} selecionado={sel} onSelecionar={setSel} somenteLeitura={ro} problemasPorItem={problemasPorItem} novoId={novoId} />
              {previa && !ro && nProblemas > 0 && (
                <div style={{ marginTop: 12 }}>
                  <h3 style={{ fontSize: 15 }}>Problemas ({nProblemas})</h3>
                  <ul style={{ paddingLeft: 18 }}>
                    {previa.bloqueios.map((b) => <li key={b}>⛔ {b}</li>)}
                    {previa.avisos.map((a) => <li key={a}>⚠ {a}</li>)}
                  </ul>
                </div>
              )}
              {v.paiId && (
                <HerancaPainel pai={pai?.rotulo ?? "procedimento-pai"} arvorePai={paiArvore} heranca={heranca} onChange={setHeranca} somenteLeitura={ro} />
              )}
            </div>
            {noSel && (
              <aside aria-label="Item selecionado" style={{ flex: "1 1 360px", minWidth: 0, border: `1px solid ${BORDA_FORTE}`, borderRadius: 10, padding: 14 }}>
                <ItemPainel no={noSel} onChange={(n) => setNos(atualizarNo(nos, n.id, () => n))} somenteLeitura={ro} problemas={problemasSel} novoId={novoId} />
              </aside>
            )}
          </div>
        )}

        {aba === "Certificado" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <label htmlFor="c-tit" style={rotulo}>Título do documento impresso</label>
              <input id="c-tit" list="c-tit-sug" style={campo} value={cfg.tituloImpresso ?? ""} disabled={ro} aria-describedby={avisoTitulo ? "c-tit-av" : undefined} onChange={(e) => setCfg({ tituloImpresso: e.target.value })} />
              <datalist id="c-tit-sug">
                <option value="CERTIFICADO DE CALIBRAÇÃO" /><option value="RELATÓRIO DE CALIBRAÇÃO" /><option value="TESTE DE SEGURANÇA ELÉTRICA - IEC 62353" />
              </datalist>
              {avisoTitulo && <p id="c-tit-av" style={ajuda}>⚠ {avisoTitulo}</p>}
            </div>
            <fieldset style={{ border: "none", padding: 0 }}>
              <legend style={rotulo}>Declaração</legend>
              {(["PADRAO", "PROPRIO"] as const).map((m) => (
                <label key={m} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, marginRight: 16, fontSize: 14 }}>
                  <input type="radio" name="c-decl" checked={(cfg.declaracao?.modo ?? "PADRAO") === m} disabled={ro} onChange={() => setCfg({ declaracao: { ...cfg.declaracao, modo: m } })} style={{ width: 20, height: 20 }} />
                  {m === "PADRAO" ? "Usar texto padrão" : "Texto próprio"}
                </label>
              ))}
              {cfg.declaracao?.modo === "PROPRIO" && (
                <textarea aria-label="Texto próprio da declaração" style={{ ...campo, minHeight: 90 }} value={cfg.declaracao?.texto ?? ""} disabled={ro} onChange={(e) => setCfg({ declaracao: { modo: "PROPRIO", texto: e.target.value } })} />
              )}
            </fieldset>
            {(
              [
                ["fraseLiberacao", "Incluir frase de liberação", "Sai 'O EQUIPAMENTO ENSAIADO ESTÁ LIBERADO PARA USO.' só se o resultado final for APROVADO. Em REPROVADO ou INCONCLUSIVO sai 'NÃO LIBERADO PARA USO'."],
                ["ocultarPadroes", "Ocultar padrões utilizados no documento", "Só esconde no PDF. O laudo continua registrando os padrões."],
                ["memoriaCalculo", "Incluir memória de cálculo", "Página de análise de conformidade (média − U, média + U, limites, resultado por ponto)."],
              ] as const
            ).map(([k, r, h]) => (
              <div key={k}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, fontSize: 14 }}>
                  <input type="checkbox" checked={k === "memoriaCalculo" ? cfg.memoriaCalculo ?? v.tipo === "CALIBRACAO" : !!cfg[k]} disabled={ro} onChange={(e) => setCfg({ [k]: e.target.checked } as Partial<CertificadoCfg>)} style={{ width: 20, height: 20 }} aria-describedby={`c-${k}-h`} />
                  {r}
                </label>
                <p id={`c-${k}-h`} style={ajuda}>{h}</p>
              </div>
            ))}
            <div style={grade}>
              <div>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, fontSize: 14 }}>
                  <input type="checkbox" checked={!!cfg.exibirDataExecucao?.ativo} disabled={ro} onChange={(e) => setCfg({ exibirDataExecucao: { ...cfg.exibirDataExecucao, ativo: e.target.checked } })} style={{ width: 20, height: 20 }} />
                  Exibir data de execução (DD/MM/AAAA)
                </label>
                <input aria-label="Rótulo da data de execução" placeholder="Data de execução" style={campo} value={cfg.exibirDataExecucao?.rotulo ?? ""} disabled={ro || !cfg.exibirDataExecucao?.ativo} onChange={(e) => setCfg({ exibirDataExecucao: { ativo: true, rotulo: e.target.value } })} />
              </div>
              <div>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, fontSize: 14 }}>
                  <input type="checkbox" checked={!!cfg.exibirValidade?.ativo} disabled={ro} onChange={(e) => setCfg({ exibirValidade: { ...cfg.exibirValidade, ativo: e.target.checked } })} style={{ width: 20, height: 20 }} />
                  Exibir validade
                </label>
                <input aria-label="Rótulo da validade" placeholder="Validade" style={campo} value={cfg.exibirValidade?.rotulo ?? ""} disabled={ro || !cfg.exibirValidade?.ativo} onChange={(e) => setCfg({ exibirValidade: { ...cfg.exibirValidade, ativo: true, rotulo: e.target.value } })} />
                <select aria-label="Formato da validade" style={{ ...campo, marginTop: 6 }} value={cfg.exibirValidade?.formato ?? "MM/AAAA"} disabled={ro || !cfg.exibirValidade?.ativo} onChange={(e) => setCfg({ exibirValidade: { ...cfg.exibirValidade, ativo: true, formato: e.target.value as "MM/AAAA" | "DD/MM/AAAA" } })}>
                  <option value="MM/AAAA">MM/AAAA</option><option value="DD/MM/AAAA">DD/MM/AAAA</option>
                </select>
              </div>
            </div>
            <fieldset style={{ border: "none", padding: 0 }}>
              <legend style={rotulo}>Assinaturas</legend>
              {(
                [["executor", "Técnico executor"], ["responsavelTecnico", "Responsável técnico (com registro)"], ["aprovacaoFinal", "Aprovação final"]] as const
              ).map(([k, r]) => (
                <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 44, fontSize: 14 }}>
                  <input type="checkbox" checked={cfg.assinaturas?.[k] ?? true} disabled={ro} onChange={(e) => setCfg({ assinaturas: { ...cfg.assinaturas, [k]: e.target.checked } })} style={{ width: 20, height: 20 }} />
                  {r}
                </label>
              ))}
            </fieldset>
          </div>
        )}

        {aba === "Anexos" && (
          <ListaTexto
            titulo="Anexos do procedimento"
            ajudaTexto="Nome e link do documento (ex.: manual do fabricante). Upload de arquivo fica para a próxima etapa."
            itens={(cfg.anexos ?? []).map((a) => `${a.nome}${a.url ? ` | ${a.url}` : ""}`)}
            somenteLeitura={ro}
            onChange={(l) => setCfg({ anexos: l.map((s) => { const [nome, url] = s.split("|").map((x) => x.trim()); return { nome, ...(url ? { url } : {}) }; }) })}
          />
        )}

        {aba === "Bibliografia" && (
          <ListaTexto titulo="Bibliografia" ajudaTexto="Uma referência por linha (norma, manual, artigo)." itens={cfg.bibliografia ?? []} somenteLeitura={ro} onChange={(l) => setCfg({ bibliografia: l })} />
        )}

        {aba === "Versões" && (
          <div>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {det.historico.map((h) => (
                <li key={h.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", minHeight: 44, borderBottom: "1px solid oklch(0.92 0.005 250)" }}>
                  <span style={{ flex: 1 }}>
                    {rotuloProcedimento({ codigo: h.codigo ?? det.codigo, titulo: h.tituloLaudo ?? det.nome, versao: h.versao, publicadoEm: h.publicadoEm })}
                    {h.publicadoPorNome ? ` · ${h.publicadoPorNome}` : h.createdByNome ? ` · ${h.createdByNome}` : ""}
                  </span>
                  <Chip v={h.status ? h : { ...h, status: "PUBLICADO" }} />
                  <button type="button" style={botao()} onClick={async () => setV(await api<Versao>(`/procedimentos-laudo/${procId}/versoes/${h.id}`))}>Ver</button>
                  {h.id !== v.id && (
                    <button type="button" style={botao()} onClick={async () => setDiff(await api<typeof diff>(`/procedimentos-laudo/${procId}/diff?de=${h.id}&para=${v.id}`))}>
                      Comparar com a aberta
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {diff && <Diferencas d={diff} />}
          </div>
        )}
      </div>

      {dialogo && (
        <div role="dialog" aria-modal="true" aria-labelledby="pub-titulo" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "grid", placeItems: "center", zIndex: 50, padding: 12 }}>
          <div style={{ background: "white", borderRadius: 12, padding: 18, maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto" }}>
            <h2 id="pub-titulo" style={{ fontSize: 18, marginTop: 0 }}>
              Publicar v{v.versao} de {v.codigo} – {v.tituloLaudo}?
            </h2>
            <p>
              {det.versaoPublicada ? `A v${det.versaoPublicada.versao} continua valendo para os laudos já feitos. ` : ""}Laudos novos passam a usar a v{v.versao}.
            </p>
            {diff && <Diferencas d={diff} />}
            {(previa?.bloqueios.length ?? 0) > 0 && (
              <>
                <h3 style={{ fontSize: 15 }}>Bloqueios ({previa!.bloqueios.length})</h3>
                <ul id="pub-bloq">{previa!.bloqueios.map((b) => <li key={b}>⛔ {b}</li>)}</ul>
              </>
            )}
            {(previa?.avisos.length ?? 0) > 0 && (
              <>
                <h3 style={{ fontSize: 15 }}>Avisos</h3>
                <ul>{previa!.avisos.map((a) => <li key={a}>⚠ {a}</li>)}</ul>
              </>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
              <button type="button" autoFocus style={botao("primario", !!previa?.bloqueios.length)} disabled={!!previa?.bloqueios.length} aria-describedby={previa?.bloqueios.length ? "pub-bloq" : undefined} onClick={() => void publicar()}>
                Publicar v{v.versao}
              </button>
              <button type="button" style={botao()} onClick={() => setDialogo(false)}>Cancelar</button>
            </div>
            {!!previa?.bloqueios.length && <p style={ajuda}>Corrija os {previa.bloqueios.length} problemas para publicar.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function Diferencas({ d }: { d: { cabecalho: string[]; incluidos: string[]; removidos: string[]; alterados: string[] } }) {
  const vazio = !d.cabecalho.length && !d.incluidos.length && !d.removidos.length && !d.alterados.length;
  return (
    <div style={{ border: `1px solid ${BORDA_FORTE}`, borderRadius: 8, padding: 10, margin: "8px 0" }}>
      <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>Diferenças</h3>
      {vazio ? <p style={{ margin: 0 }}>Sem diferenças.</p> : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {d.cabecalho.length > 0 && <li>Cabeçalho: {d.cabecalho.join(", ")}</li>}
          {d.incluidos.length > 0 && <li>Incluídos: {d.incluidos.length}</li>}
          {d.removidos.length > 0 && <li>Removidos: {d.removidos.length}</li>}
          {d.alterados.length > 0 && <li>Alterados (itens, limites, regra): {d.alterados.length}</li>}
        </ul>
      )}
    </div>
  );
}

function ListaTexto({ titulo, ajudaTexto, itens, somenteLeitura, onChange }: { titulo: string; ajudaTexto: string; itens: string[]; somenteLeitura: boolean; onChange: (l: string[]) => void }) {
  return (
    <div>
      <label htmlFor={`lt-${titulo}`} style={rotulo}>{titulo}</label>
      <textarea
        id={`lt-${titulo}`}
        aria-describedby={`lt-${titulo}-h`}
        style={{ ...campo, minHeight: 160 }}
        value={itens.join("\n")}
        disabled={somenteLeitura}
        onChange={(e) => onChange(e.target.value.split("\n").map((s) => s.trimEnd()).filter((s, i, a) => s || i < a.length - 1))}
      />
      <p id={`lt-${titulo}-h`} style={ajuda}>{ajudaTexto}</p>
    </div>
  );
}

/** 6e: itens herdados do pai — ocultar e sobrescrever tipo, resolução, nº de leituras, ordem e limites. */
function HerancaPainel({ pai, arvorePai, heranca, onChange, somenteLeitura }: {
  pai: string; arvorePai: ArvoreProcedimento | null; heranca: NonNullable<ArvoreProcedimento["heranca"]>; onChange: (h: ArvoreProcedimento["heranca"]) => void; somenteLeitura: boolean;
}) {
  if (!arvorePai) return <p style={ajuda}>Carregando itens do procedimento-pai…</p>;
  const ocultos = new Set(heranca.ocultos ?? []);
  const sob = heranca.sobrescritas ?? {};
  const setSob = (id: string, s: Sobrescrita | null) => {
    const n = { ...sob };
    if (s && Object.keys(s).length) n[id] = s;
    else delete n[id];
    onChange({ ...heranca, sobrescritas: n });
  };
  return (
    <div style={{ marginTop: 16, border: `1px solid ${BORDA_FORTE}`, borderRadius: 10, padding: 12 }}>
      <h3 style={{ fontSize: 15, marginTop: 0 }}>Herdado de {pai}</h3>
      <p style={ajuda}>“Herdar do pai” é o padrão. Sobrescreva só o que muda neste derivado.</p>
      {itensDaArvore(arvorePai.nos).map((it) => {
        const s = sob[it.id] ?? {};
        return (
          <fieldset key={it.id} style={{ border: "1px solid oklch(0.85 0.01 250)", borderRadius: 8, padding: 10, marginBottom: 8 }}>
            <legend style={{ fontWeight: 700 }}>{it.titulo}{Object.keys(s).length ? " · sobrescrito" : " · herdado"}</legend>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44 }}>
              <input type="checkbox" checked={ocultos.has(it.id)} disabled={somenteLeitura} style={{ width: 20, height: 20 }}
                onChange={(e) => onChange({ ...heranca, ocultos: e.target.checked ? [...ocultos, it.id] : [...ocultos].filter((x) => x !== it.id) })} />
              Ocultar neste derivado
            </label>
            {it.tipo === "MEDICAO" && !ocultos.has(it.id) && (
              <div style={grade}>
                <div><label htmlFor={`h-n-${it.id}`} style={rotulo}>Nº de leituras (pai: {it.nLeituras ?? 1})</label>
                  <input id={`h-n-${it.id}`} type="number" min={1} style={campo} value={s.nLeituras ?? ""} placeholder="herdar" disabled={somenteLeitura}
                    onChange={(e) => setSob(it.id, { ...s, nLeituras: e.target.value ? Number(e.target.value) : undefined })} /></div>
                <div><label htmlFor={`h-r-${it.id}`} style={rotulo}>Resolução (pai: {it.resolucao ?? "—"})</label>
                  <input id={`h-r-${it.id}`} inputMode="decimal" style={campo} value={s.resolucao ?? ""} placeholder="herdar" disabled={somenteLeitura}
                    onChange={(e) => { const { resolucao: _r, ...resto } = s; setSob(it.id, e.target.value ? { ...resto, resolucao: Number(e.target.value.replace(",", ".")) } : resto); }} /></div>
                <div><label htmlFor={`h-o-${it.id}`} style={rotulo}>Ordem (pai: {it.ordem ?? "CRESCENTE"})</label>
                  <select id={`h-o-${it.id}`} style={campo} value={s.ordem ?? ""} disabled={somenteLeitura} onChange={(e) => setSob(it.id, { ...s, ordem: (e.target.value || undefined) as Sobrescrita["ordem"] })}>
                    <option value="">herdar</option><option value="CRESCENTE">Crescente</option><option value="DECRESCENTE">Decrescente</option><option value="AMBAS">Ambas</option>
                  </select></div>
                {(it.pontos ?? []).map((p) => (
                  <div key={p.id}><label htmlFor={`h-l-${it.id}-${p.id}`} style={rotulo}>Limite ±% em {p.nominal} {it.unidade} (pai: {p.limite.tipo} {p.limite.a ?? ""}{p.limite.b != null ? `/${p.limite.b}` : ""})</label>
                    <input id={`h-l-${it.id}-${p.id}`} inputMode="decimal" style={campo} placeholder="herdar" disabled={somenteLeitura}
                      value={s.limites?.[p.id]?.a ?? ""}
                      onChange={(e) => {
                        const lim = { ...(s.limites ?? {}) };
                        if (e.target.value) lim[p.id] = { tipo: "NOM_PCT", a: Number(e.target.value.replace(",", ".")) };
                        else delete lim[p.id];
                        const { limites: _l, ...resto } = s;
                        setSob(it.id, Object.keys(lim).length ? { ...resto, limites: lim } : resto);
                      }} /></div>
                ))}
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
