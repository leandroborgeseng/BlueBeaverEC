/**
 * E2 — operações puras da árvore do checklist usadas pelo editor (teclado Alt+setas, menu ⋮, "Mover para…").
 * Toda operação devolve uma árvore nova (imutável) e respeita 3 níveis; item não aceita filhos.
 */
import { PROFUNDIDADE_MAX_ARVORE, type NoArvore } from "./procedimento-arvore";

type Local = { pai: NoArvore | null; irmaos: NoArvore[]; indice: number; nivel: number };

const copia = (nos: NoArvore[]): NoArvore[] => JSON.parse(JSON.stringify(nos));

export function localizarNo(nos: NoArvore[], id: string, pai: NoArvore | null = null, nivel = 1): Local | null {
  for (let i = 0; i < nos.length; i++) {
    if (nos[i].id === id) return { pai, irmaos: nos, indice: i, nivel };
    const r = nos[i].filhos ? localizarNo(nos[i].filhos!, id, nos[i], nivel + 1) : null;
    if (r) return r;
  }
  return null;
}

/** Altura da subárvore (1 = só o nó). */
function altura(n: NoArvore): number {
  return 1 + Math.max(0, ...(n.filhos ?? []).map(altura));
}

export function moverCimaBaixo(nos: NoArvore[], id: string, delta: -1 | 1): NoArvore[] {
  const t = copia(nos);
  const l = localizarNo(t, id);
  if (!l) return nos;
  const j = l.indice + delta;
  if (j < 0 || j >= l.irmaos.length) return nos;
  [l.irmaos[l.indice], l.irmaos[j]] = [l.irmaos[j], l.irmaos[l.indice]];
  return t;
}

/** Alt+→: aninha no irmão anterior (que precisa ser seção). */
export function recuar(nos: NoArvore[], id: string): NoArvore[] {
  const t = copia(nos);
  const l = localizarNo(t, id);
  if (!l || l.indice === 0) return nos;
  const alvo = l.irmaos[l.indice - 1];
  if (alvo.item) return nos;
  const no = l.irmaos[l.indice];
  if (l.nivel + altura(no) > PROFUNDIDADE_MAX_ARVORE) return nos;
  l.irmaos.splice(l.indice, 1);
  alvo.filhos = [...(alvo.filhos ?? []), no];
  return t;
}

/** Alt+←: sobe um nível, logo depois do pai. */
export function avancar(nos: NoArvore[], id: string): NoArvore[] {
  const t = copia(nos);
  const l = localizarNo(t, id);
  if (!l?.pai) return nos;
  const lp = localizarNo(t, l.pai.id)!;
  const [no] = l.irmaos.splice(l.indice, 1);
  lp.irmaos.splice(lp.indice + 1, 0, no);
  return t;
}

/** Destinos válidos para "Mover para…": raiz e seções onde o nó cabe (sem entrar em si mesmo). */
export function destinosValidos(nos: NoArvore[], id: string): Array<{ id: string | null; titulo: string; nivel: number }> {
  const l = localizarNo(nos, id);
  if (!l) return [];
  const no = l.irmaos[l.indice];
  const out: Array<{ id: string | null; titulo: string; nivel: number }> = [{ id: null, titulo: "Raiz do checklist", nivel: 0 }];
  const visita = (ns: NoArvore[], nivel: number) => {
    for (const n of ns) {
      if (n.item || n.id === id) continue;
      if (nivel + altura(no) <= PROFUNDIDADE_MAX_ARVORE) out.push({ id: n.id, titulo: n.titulo, nivel });
      visita(n.filhos ?? [], nivel + 1);
    }
  };
  visita(nos, 1);
  return out;
}

export function moverPara(nos: NoArvore[], id: string, destinoId: string | null): NoArvore[] {
  if (!destinosValidos(nos, id).some((d) => d.id === destinoId)) return nos;
  const t = copia(nos);
  const l = localizarNo(t, id)!;
  const [no] = l.irmaos.splice(l.indice, 1);
  if (destinoId == null) t.push(no);
  else {
    const d = localizarNo(t, destinoId)!;
    const sec = d.irmaos[d.indice];
    sec.filhos = [...(sec.filhos ?? []), no];
  }
  return t;
}

export function removerNo(nos: NoArvore[], id: string): NoArvore[] {
  const t = copia(nos);
  const l = localizarNo(t, id);
  if (!l) return nos;
  l.irmaos.splice(l.indice, 1);
  return t;
}

export function duplicarNo(nos: NoArvore[], id: string, novoId: (base: string) => string): NoArvore[] {
  const t = copia(nos);
  const l = localizarNo(t, id);
  if (!l) return nos;
  const reid = (n: NoArvore): NoArvore => {
    const nid = novoId(n.id);
    return { ...n, id: nid, titulo: n.titulo, item: n.item ? { ...n.item, id: nid } : undefined, filhos: n.filhos?.map(reid) };
  };
  const dup = reid(l.irmaos[l.indice]);
  dup.titulo = `${dup.titulo} (cópia)`;
  if (dup.item) dup.item.titulo = dup.titulo;
  l.irmaos.splice(l.indice + 1, 0, dup);
  return t;
}

export function atualizarNo(nos: NoArvore[], id: string, fn: (n: NoArvore) => NoArvore): NoArvore[] {
  const t = copia(nos);
  const l = localizarNo(t, id);
  if (!l) return nos;
  l.irmaos[l.indice] = fn(l.irmaos[l.indice]);
  return t;
}

/** Insere em seção (ou raiz); recusa se passar de 3 níveis. */
export function inserirNo(nos: NoArvore[], paiId: string | null, no: NoArvore): NoArvore[] {
  const t = copia(nos);
  if (paiId == null) return [...t, no];
  const l = localizarNo(t, paiId);
  if (!l || l.irmaos[l.indice].item || l.nivel + altura(no) > PROFUNDIDADE_MAX_ARVORE) return nos;
  const sec = l.irmaos[l.indice];
  sec.filhos = [...(sec.filhos ?? []), no];
  return t;
}

/** Texto do aria-live após mover (UX §2). */
export function anunciarPosicao(nos: NoArvore[], id: string): string {
  const l = localizarNo(nos, id);
  if (!l) return "";
  const titulo = l.irmaos[l.indice].titulo;
  const onde = l.pai ? `em ${l.pai.titulo}` : "na raiz";
  return `${titulo} movido para posição ${l.indice + 1} de ${l.irmaos.length} ${onde}`;
}
