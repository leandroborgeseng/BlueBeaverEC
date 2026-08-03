#!/usr/bin/env python3
"""Extrai checklists do Anexo A (coluna esquerda das tabelas) → JSON."""
from __future__ import annotations

import json
import re
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "scripts/dados/pops-biblioteca"
OUT_DIR = ROOT / "scripts/dados/checklists-preventiva"

FILE_RE = re.compile(r"^POP\.EC\.MP\.(\d+)_(.+)\.pdf$", re.I)
SECTION_RE = re.compile(
    r"^(\d{2})\s+(DISPONIBILIDADE|VERIFICA|TESTES|ACESS|PARÂMETROS|PARAMETROS).+",
    re.I,
)
MESES_RE = re.compile(r"é de\s+(\d+)\s*(?:\([^)]*\))?\s*meses", re.I)

NOISE_EXACT = {
    "c",
    "n.c",
    "n.a",
    "observações",
    "obser",
    "item a ser verificado",
    "item a ser",
    "legenda",
    "c – conforme",
    "n.c – não conforme",
    "n.a – não aplicável",
}


def humanize(slug: str) -> str:
    s = slug.replace("_", " ")
    s = re.sub(r"([a-zà-ú])([A-ZÁ-Ú])", r"\1 \2", s)
    return re.sub(r"\s+", " ", s).strip()


def extract_periodicity(doc: fitz.Document) -> int:
    blob = "\n".join((doc[i].get_text() or "") for i in range(min(12, doc.page_count)))
    m = MESES_RE.search(blob)
    if m:
        n = int(m.group(1))
        if 1 <= n <= 24:
            return n
    return 6


def find_annex_pages(doc: fitz.Document) -> list[int]:
    pages = []
    for i in range(doc.page_count):
        t = doc[i].get_text() or ""
        if "Item a ser verificado" in t and re.search(r"\b0[1-9]\b", t):
            # prefer pages in last third
            if i >= doc.page_count * 0.55 or "ANEXO A" in t:
                pages.append(i)
    if not pages:
        # last 3 pages
        pages = list(range(max(0, doc.page_count - 3), doc.page_count))
    # keep contiguous from first annex-like in second half
    start = min(pages)
    return list(range(start, doc.page_count))


def left_column_lines(page: fitz.Page) -> list[tuple[float, str]]:
    """Linhas da metade esquerda da página (coluna 'Item a ser verificado')."""
    w = page.rect.width
    cutoff = w * 0.48
    blocks = page.get_text("dict")["blocks"]
    lines_out: list[tuple[float, float, str]] = []
    for b in blocks:
        if b.get("type") != 0:
            continue
        for line in b.get("lines", []):
            spans = line.get("spans", [])
            if not spans:
                continue
            x0 = min(s["bbox"][0] for s in spans)
            y0 = min(s["bbox"][1] for s in spans)
            text = "".join(s["text"] for s in spans).strip()
            text = re.sub(r"\s+", " ", text)
            if not text:
                continue
            # header spans full width — keep if section
            if x0 > cutoff and not SECTION_RE.match(text) and not re.match(r"^\d{2}\s+", text):
                continue
            # skip right-side column headers that start mid-page
            if x0 > cutoff * 0.85 and text.upper() in ("C", "N.C", "N.A", "OBSERVAÇÕES", "OBSER"):
                continue
            lines_out.append((y0, x0, text))
    lines_out.sort(key=lambda t: (round(t[0] / 2), t[1]))
    return [(y, t) for y, x, t in lines_out]


def is_noise(text: str) -> bool:
    t = text.strip()
    tl = t.lower()
    if tl in NOISE_EXACT:
        return True
    if len(t) < 3:
        return True
    if re.match(
        r"^(Tipo do|Documento|Título|PROCEDIMENTO|POP\.EC|Emissão|Versão|Próxima|"
        r"Modelo:|Fabricante:|Identificador|Nº de|Setor/|EXECUÇÃO|Hora:|"
        r"EQUIPAMENTO INSPECIONADO|ANEXO A|Executor|Engenheiro|Elaboração|"
        r"Revisão|Validação|Aprovação|Data:|MANUTENÇÃO|PREVENTIVA DE|"
        r"EQUIPAMENTOS DO TIPO|EQUIPAMENTO DO)",
        t,
        re.I,
    ):
        return True
    if "...." in t:
        return True
    if re.match(r"^\d{4}$", t):
        return True
    if "janeiro de" in tl:
        return True
    return False


def extract_items(doc: fitz.Document) -> list[dict]:
    pages = find_annex_pages(doc)
    section = "01 DISPONIBILIDADE DO EQUIPAMENTO"
    secao_ordem = 1
    counts: dict[str, int] = {}
    items: list[dict] = []
    seen: set[str] = set()

    raw: list[str] = []
    for pi in pages:
        for _, text in left_column_lines(doc[pi]):
            raw.append(text)

    # juntar quebras só se a continuação começa em minúscula (mesma frase)
    merged: list[str] = []
    i = 0
    while i < len(raw):
        cur = raw[i]
        if (
            i + 1 < len(raw)
            and not SECTION_RE.match(cur)
            and not re.match(r"^\d{2}\s+", cur)
            and not SECTION_RE.match(raw[i + 1])
            and not is_noise(cur)
            and not is_noise(raw[i + 1])
            and len(cur) <= 55
            and not cur.endswith(".")
            and raw[i + 1][:1].islower()
        ):
            cur = f"{cur} {raw[i + 1]}".strip()
            i += 1
        merged.append(cur)
        i += 1

    for ln in merged:
        if re.match(r"^\d{2}\s+\S+", ln) and len(ln) < 90 and "Item a ser" not in ln:
            if SECTION_RE.match(ln) or re.match(
                r"^\d{2}\s+(DISPONIBILIDADE|VERIFICA|TESTES|ACESS|PAR)", ln, re.I
            ):
                section = ln
                secao_ordem = int(ln[:2])
                continue

        if is_noise(ln):
            continue
        if ln.upper().startswith("OBSERVA"):
            continue
        if "PROCEDIMENTO:" in ln:
            continue
        if len(ln) > 110:
            continue

        key = ln.lower()
        if key in seen:
            continue
        # descartar fragmentos inúteis
        if key in {"multiuso", "cardioversor", "de seringa", "equipamento"}:
            continue
        seen.add(key)

        counts[section] = counts.get(section, 0) + 1
        n = counts[section]
        items.append(
            {
                "id": f"{secao_ordem:02d}-{n:02d}",
                "secao": section,
                "secaoOrdem": secao_ordem,
                "pergunta": ln,
            }
        )

    return items


def add_quadro_disponibilidade(doc: fitz.Document, items: list[dict]) -> list[dict]:
    """Garante Localização / Identificação / Disponibilidade a partir do Quadro 7."""
    wanted = [
        "Localização do equipamento",
        "Identificação do equipamento",
        "Disponibilidade do equipamento",
    ]
    blob = "\n".join((doc[i].get_text() or "") for i in range(doc.page_count))
    found = [w for w in wanted if w in blob]

    sec01 = [i for i in items if i["secaoOrdem"] == 1]
    rest = [i for i in items if i["secaoOrdem"] != 1]
    existing = {i["pergunta"].lower() for i in sec01}

    extras = []
    for w in found:
        if not any(w.lower().startswith(e[:12]) or e.startswith(w.lower()[:12]) for e in existing):
            extras.append(
                {
                    "id": "01-00",
                    "secao": "01 DISPONIBILIDADE DO EQUIPAMENTO",
                    "secaoOrdem": 1,
                    "pergunta": w,
                }
            )

    # Preferir nomes completos do Quadro para disponibilidade truncada
    new_sec01 = extras + sec01
    # Dedup rough
    seen = set()
    cleaned = []
    for it in new_sec01:
        p = it["pergunta"]
        # upgrade truncated
        for w in found:
            if w.lower().startswith(p.lower()[:12]) and len(w) > len(p):
                p = w
                it = {**it, "pergunta": p}
                break
        k = it["pergunta"].lower()
        if k in seen:
            continue
        # skip truncated "Disponibilidade do" if full exists
        if k.startswith("disponibilidade do") and "disponibilidade do equipamento" in seen:
            continue
        seen.add(k)
        cleaned.append(it)

    for n, it in enumerate(cleaned, 1):
        it["id"] = f"01-{n:02d}"
        it["secao"] = "01 DISPONIBILIDADE DO EQUIPAMENTO"
        it["secaoOrdem"] = 1

    return cleaned + rest


def expand_from_quadro(doc: fitz.Document, items: list[dict]) -> list[dict]:
    """Substitui rótulos truncados por títulos do Quadro 7 (prefixo)."""
    candidates: list[str] = []
    started = False
    for i in range(doc.page_count):
        text = doc[i].get_text() or ""
        if "Quadro 7" in text or "6.3.1" in text:
            started = True
        if not started:
            continue
        lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines() if ln.strip()]
        for j, ln in enumerate(lines):
            if re.search(r"^7 REGISTRO|^8 REFER", ln):
                started = False
                break
            if is_noise(ln) or ln in ("Item de verificação", "Instruções"):
                continue
            if ln.startswith("•") or ln.startswith("Figura") or ln.startswith("Fonte"):
                continue
            nxt = lines[j + 1] if j + 1 < len(lines) else ""
            if 6 <= len(ln) <= 110 and (
                nxt.startswith("•")
                or nxt.startswith("Verifique")
                or nxt.startswith("Execute")
                or nxt.startswith("Utilizando")
                or nxt.startswith("Ligue")
                or nxt.startswith("Realize")
                or nxt.startswith("Configure")
                or nxt.startswith("O ")
                or nxt.startswith("Quando")
                or nxt.startswith("Certifique")
                or nxt.startswith("Alguns")
                or nxt.startswith("Preencha")
                or nxt.startswith("Retire")
                or nxt.startswith("Conecte")
                or nxt.startswith("Desconecte")
                or nxt.startswith("A função")
                or nxt.startswith("O alarme")
                or nxt.startswith("O autoteste")
                or nxt.startswith("Para os casos")
                or nxt.startswith("No equipamento")
            ):
                if not re.match(r"^Verifica|^Testes? |^Acess|^Pás$|^Eletro", ln, re.I):
                    candidates.append(ln)
        if not started:
            break

    uniq: list[str] = []
    seen_c = set()
    for c in candidates:
        k = c.lower()
        if k not in seen_c:
            seen_c.add(k)
            uniq.append(c)

    out = []
    for it in items:
        p = it["pergunta"]
        pl = p.lower().rstrip()
        best = None
        best_len = 0
        for c in uniq:
            cl = c.lower()
            if cl.startswith(pl) and len(c) >= len(p) and len(c) > best_len:
                best = c
                best_len = len(c)
            elif pl.endswith((" do", " da", " de", " dos", " das", " e")) and cl.startswith(pl[:-1].strip()) and len(c) > best_len:
                best = c
                best_len = len(c)
        if best:
            it = {**it, "pergunta": best}
        out.append(it)
    return out


def process_pdf(path: Path) -> dict | None:
    m = FILE_RE.match(path.name)
    if not m:
        return None
    num, slug = m.group(1), m.group(2)
    codigo = f"POP.EC.MP.{num}"
    doc = fitz.open(str(path))
    meses = extract_periodicity(doc)
    items = extract_items(doc)
    items = add_quadro_disponibilidade(doc, items)
    items = expand_from_quadro(doc, items)

    # limpeza final
    cleaned = []
    seen = set()
    for it in items:
        p = it["pergunta"].strip()
        if is_noise(p):
            continue
        if re.match(r"^\d{2}\s+TESTE", p, re.I):
            continue
        if p.upper() in {"EQUIPAMENTOS DO", "EQUIPAMENTO DO", "ITEM A SER I"}:
            continue
        if len(p) < 5:
            continue
        k = p.lower()
        if k in seen:
            continue
        seen.add(k)
        cleaned.append({**it, "pergunta": p})

    return {
        "codigoPop": codigo,
        "nome": f"Preventiva — {humanize(slug)} ({codigo})",
        "tipo": "PREVENTIVA",
        "validadeMeses": meses,
        "fonte": f"Anexo A · {codigo}",
        "legenda": {"C": "Conforme", "N.C": "Não conforme", "N.A": "Não aplicável"},
        "itens": cleaned,
        "_meta": {"arquivo": path.name, "itens": len(cleaned), "pages": doc.page_count},
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(PDF_DIR.glob("POP.EC.MP.*.pdf"))
    print(f"[extract] {len(files)} PDFs")
    weak, errors = [], []
    for f in files:
        try:
            data = process_pdf(f)
            assert data
            meta = data.pop("_meta")
            n = len(data["itens"])
            (OUT_DIR / f"{data['codigoPop']}.json").write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            flag = "OK" if 6 <= n <= 90 else "WEAK"
            if flag == "WEAK":
                weak.append(f"{data['codigoPop']}:{n}")
            print(f"[{flag}] {data['codigoPop']} · {n} · {data['validadeMeses']}m")
        except Exception as e:
            errors.append(f"{f.name}: {e}")
            print(f"[ERR] {f.name}: {e}")

    report = {"total": len(files), "weak": weak, "errors": errors}
    (OUT_DIR / "_extract_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
