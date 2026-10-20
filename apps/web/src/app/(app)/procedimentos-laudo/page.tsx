"use client";

/**
 * E2 — Procedimentos de laudo: lista "CÓDIGO – TÍTULO vX (publicação dd/mm/aaaa)" + editor estruturado.
 * O antigo editor de JSON foi removido (itens agora só no rascunho da versão).
 */
import { FormEvent, useCallback, useEffect, useState } from "react";
import { PERMISSAO_NIVEL, temPermissaoEspecial } from "@aion/shared";
import { api } from "@/lib/api";
import { useCan, useSession } from "@/lib/session";
import { PageHeader, Surface } from "@/components/ui/aion-ui";
import { ProcedimentoEditor } from "@/components/procedimentos/ProcedimentoEditor";
import { ajuda, botao, campo, grade, rotulo, BORDA_FORTE, TEXTO } from "@/components/procedimentos/estilos";

interface Proc {
  id: string;
  nome: string;
  tipo: string;
  ativo: boolean;
  rotulo: string;
  versaoPublicadaId: string | null;
  rascunhoId: string | null;
  itens: unknown[];
  modelos: Array<{ modelo: { id: string; nome: string; fabricante: { nome: string } } }>;
}
interface Modelo {
  id: string;
  nome: string;
  fabricante: { nome: string };
}

const TIPOS = [["RECEBIMENTO", "Recebimento"], ["PREVENTIVA", "Preventiva"], ["CALIBRACAO", "Calibração"], ["TSE", "TSE"], ["QUALIFICACAO", "Qualificação"]];

export default function ProcedimentosPage() {
  const sessao = useSession();
  const podePublicar = temPermissaoEspecial(sessao?.permissoesEspeciais, "procedimento.publicar");
  const podeEditar = useCan("laudos", PERMISSAO_NIVEL.EDICAO);
  const podeAprovar = useCan("laudos", PERMISSAO_NIVEL.EDICAO_APROVACAO);
  const [items, setItems] = useState<Proc[] | null>(null);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [inativos, setInativos] = useState(false);

  const load = useCallback(async () => {
    const [p, m] = await Promise.all([api<Proc[]>(`/procedimentos-laudo${inativos ? "?inativos=1" : ""}`), api<Modelo[]>("/modelos").catch(() => [])]);
    setItems(p);
    setModelos(m);
  }, [inativos]);

  useEffect(() => {
    void load().catch((e) => setMsg(e.message));
  }, [load]);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      const r = await api<{ id: string }>("/procedimentos-laudo", {
        method: "POST",
        body: JSON.stringify({
          codigo: String(fd.get("codigo") ?? "").trim(),
          tituloLaudo: String(fd.get("tituloLaudo") ?? "").trim(),
          tipo: String(fd.get("tipo")),
          ...(fd.get("tipoDocumento") ? { tipoDocumento: String(fd.get("tipoDocumento")) } : {}),
          validadeMeses: Number(fd.get("validadeMeses") || 12),
          generico: fd.get("generico") === "on",
          norma: String(fd.get("norma") ?? "").trim() || undefined,
        }),
      });
      setNovo(false);
      setMsg(null);
      await load();
      setAberto(r.id);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  async function acao(path: string, body?: unknown) {
    try {
      await api(path, { method: "POST", ...(body ? { body: JSON.stringify(body) } : {}) });
      setMsg(null);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    }
  }

  if (aberto) {
    return (
      <div style={{ padding: "0 4px" }}>
        <ProcedimentoEditor
          procId={aberto}
          podePublicar={podePublicar}
          podeAprovar={podeAprovar}
          onFechar={() => {
            setAberto(null);
            void load();
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ color: TEXTO }}>
      <PageHeader title="Procedimentos de Laudo" subtitle="Rascunho → publicação versionada · laudos já emitidos mantêm a versão usada" />
      {msg && <p role="alert" style={{ border: "2px solid var(--aion-danger)", borderRadius: 8, padding: 10 }}>⛔ {msg}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 16px" }}>
        {podeEditar && <button type="button" style={botao("primario")} onClick={() => setNovo((x) => !x)} aria-expanded={novo}>Novo procedimento</button>}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44 }}>
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} style={{ width: 20, height: 20 }} />
          Mostrar inativos
        </label>
      </div>

      {novo && (
        <Surface style={{ marginBottom: 16 }}>
          <form onSubmit={onCreate} style={{ display: "grid", gap: 12 }} aria-label="Novo procedimento">
            <div style={grade}>
              <div><label htmlFor="n-cod" style={rotulo}>Código*</label><input id="n-cod" name="codigo" required style={campo} /></div>
              <div><label htmlFor="n-tit" style={rotulo}>Título do laudo*</label><input id="n-tit" name="tituloLaudo" required minLength={2} style={campo} /></div>
              <div><label htmlFor="n-tipo" style={rotulo}>Tipo*</label><select id="n-tipo" name="tipo" style={campo}>{TIPOS.map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></div>
              <div><label htmlFor="n-val" style={rotulo}>Validade em meses*</label><input id="n-val" name="validadeMeses" type="number" min={1} defaultValue={12} style={campo} /></div>
              <div><label htmlFor="n-norma" style={rotulo}>Norma / referência</label><input id="n-norma" name="norma" style={campo} /></div>
            </div>
            <fieldset style={{ border: "none", padding: 0 }}>
              <legend style={rotulo}>Documento emitido* (obrigatório para publicar)</legend>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, marginRight: 16 }}><input type="radio" name="tipoDocumento" value="LAUDO" style={{ width: 20, height: 20 }} />Laudo</label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44 }}><input type="radio" name="tipoDocumento" value="CERTIFICADO" style={{ width: 20, height: 20 }} />Certificado</label>
            </fieldset>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44 }}><input type="checkbox" name="generico" style={{ width: 20, height: 20 }} />Procedimento genérico</label>
            <p style={ajuda}>Nasce em rascunho. Itens e limites são editados na aba Checklist.</p>
            <div><button type="submit" style={botao("primario")}>Criar rascunho</button></div>
          </form>
        </Surface>
      )}

      {items === null ? (
        <ul aria-busy="true" aria-label="Carregando procedimentos" style={{ listStyle: "none", padding: 0 }}>
          {[0, 1, 2].map((i) => <li key={i} style={{ height: 56, margin: "8px 0", borderRadius: 8, background: "oklch(0.95 0.005 250)" }} />)}
        </ul>
      ) : items.length === 0 ? (
        <Surface>
          <p>Nenhum procedimento ainda. Crie o primeiro para padronizar os laudos.</p>
          {podeEditar && <button type="button" style={botao("primario")} onClick={() => setNovo(true)}>Novo procedimento</button>}
        </Surface>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 10 }}>
          {items.map((p) => {
            const publicado = !!p.versaoPublicadaId;
            return (
              <li key={p.id} style={{ border: `1px solid ${BORDA_FORTE}`, borderRadius: 10, padding: 12, background: "white" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <strong style={{ flex: "1 1 260px", overflowWrap: "anywhere" }}>{p.rotulo}</strong>
                  <span style={{ fontSize: 13 }}>
                    {!p.ativo ? "⊘ Inativo" : publicado ? "✓ Publicado" : p.rascunhoId ? "✎ Rascunho" : "◷ Legado"}
                    {publicado && p.rascunhoId ? " · ✎ rascunho aberto" : ""}
                  </span>
                  <button type="button" style={botao()} onClick={() => setAberto(p.id)}>{podeEditar ? "Abrir" : "Ver"}</button>
                  {podeAprovar && p.ativo && (
                    <button type="button" style={botao("perigo")} onClick={() => window.confirm(`Inativar ${p.rotulo}? Laudos emitidos não mudam; o procedimento não emite laudos novos.`) && void acao(`/procedimentos-laudo/${p.id}/inativar`)}>
                      Inativar
                    </button>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 8 }}>
                  <span style={{ fontSize: 13, flex: "1 1 260px" }}>
                    {p.modelos.length ? p.modelos.map((m) => `${m.modelo.fabricante.nome} / ${m.modelo.nome}`).join(" · ") : "Sem modelos vinculados"}
                  </span>
                  {podeEditar && p.ativo && (
                    <select aria-label={`Vincular modelo a ${p.rotulo}`} style={{ ...campo, width: "auto", minWidth: 220 }} defaultValue="" disabled={!publicado && !!p.rascunhoId && !p.itens.length}
                      onChange={(e) => e.target.value && void acao(`/procedimentos-laudo/${p.id}/vincular`, { modeloId: e.target.value })}>
                      <option value="">Vincular modelo…</option>
                      {modelos.map((m) => <option key={m.id} value={m.id}>{m.fabricante.nome} / {m.nome}</option>)}
                    </select>
                  )}
                </div>
                <details style={{ marginTop: 6 }}>
                  <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>Ver JSON (somente leitura)</summary>
                  <pre style={{ fontSize: 12, overflow: "auto", maxHeight: 240 }}>{JSON.stringify(p.itens, null, 2)}</pre>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
