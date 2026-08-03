#!/usr/bin/env python3
"""Extrai checklists TSE do Anexo A (Classe I + Classe II) dos POP.EC.SEG.* → JSON."""
from __future__ import annotations

import json
import re
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "scripts/dados/pops-biblioteca"
OUT_DIR = ROOT / "scripts/dados/checklists-tse"

FILE_RE = re.compile(r"^POP\.EC\.SEG\.(\d+)_(.+)\.pdf$", re.I)
SECTION_RE = re.compile(
    r"^(\d{2})\s+(DISPONIBILIDADE|CONDIÇÕES|CONDIÇÕES AMBIENTAIS|TENSÃO|TENSAO|"
    r"RESISTÊNCIA|RESISTENCIA|CORRENTE)\b",
    re.I,
)
MESES_RE = re.compile(r"é de\s+(\d+)\s*(?:\([^)]*\))?\s*meses", re.I)

HEADER_NOISE_RE = re.compile(
    r"^(elétrica aplicado|equipamentos? do tipo|equipamento do tipo|"
    r"TESTE DE|ELÉTRICA APLICADO|PROCEDIMENTO[/:]|"
    r"DESFIBRILADOR|CARDIOVERSOR|MARCAPASSO|VENTILADOR|MONITOR|"
    r"UNIDADES? DE|BERÇO|BISTURI|OXÍMETRO|OXIMETRO|CAMA |MESA |"
    r"FACOEMULSIFICADOR|BANHO |APARELHO |INJETOR|HEMODIÁLISE|HEMODIALISE|"
    r"PERFURADOR|ELETROCARDIO|ELETRODO)",
    re.I,
)


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
    return 12


def annex_text(doc: fitz.Document) -> str:
    start = None
    for i in range(doc.page_count):
        t = doc[i].get_text() or ""
        if "ANEXO A" in t and ("CLASSE I" in t or "Item a ser verificado" in t or "DISPONIBILIDADE" in t):
            start = i
            break
    if start is None:
        for i in range(doc.page_count):
            t = doc[i].get_text() or ""
            if "Item a ser verificado" in t and i >= doc.page_count * 0.55:
                start = i
                break
    if start is None:
        start = max(0, doc.page_count - 6)
    return "\n".join(doc[i].get_text() or "" for i in range(start, doc.page_count))


def is_noise(text: str) -> bool:
    t = text.strip()
    tl = t.lower()
    if len(t) < 3:
        return True
    if tl in {
        "c",
        "n.c",
        "n.a",
        "observações",
        "obser",
        "item a ser verificado",
        "item a ser",
        "valor medido",
        "c / n.c / observações",
        "c / n.c / observaçõe",
    }:
        return True
    if re.match(
        r"^(Tipo do|Documento|Título|PROCEDIMENTO[/:]|POP\.EC|Emissão|Versão|Próxima|"
        r"Modelo:|Fabricante:|Código de ID:|Nº de|Setor/|EXECUÇÃO|Hora:|"
        r"EQUIPAMENTO INSPECIONADO|ANEXO A|Elaboração|Revisão|Validação|"
        r"Aprovação|Data:|TESTE DE SEGURANÇA|AION ENGENHARIA|Página \d|"
        r"Formulários para|\(\d{2}\)|www\.aion)",
        t,
        re.I,
    ):
        return True
    if "janeiro de" in tl or "cerqueira" in tl:
        return True
    if HEADER_NOISE_RE.match(t):
        return True
    if t.endswith("-") and len(t) < 40:
        return True
    if "...." in t:
        return True
    return False


def normalize_lines(blob: str) -> list[str]:
    raw = [re.sub(r"\s+", " ", ln).strip() for ln in blob.splitlines()]
    raw = [ln for ln in raw if ln]
    merged: list[str] = []
    i = 0
    while i < len(raw):
        cur = raw[i]
        while (
            i + 1 < len(raw)
            and not SECTION_RE.match(cur)
            and not re.match(r"^CLASSE\s+(I{1,2})\b", raw[i + 1], re.I)
            and not re.match(r"^\d{2}\s+", raw[i + 1])
            and not is_noise(raw[i + 1])
            and (
                re.match(r"^\(?(uA|µA|mOhm)\)?\.?$", raw[i + 1], re.I)
                or (
                    len(cur) <= 75
                    and not cur.endswith((")", ".", "%", "°C"))
                    and (
                        raw[i + 1].startswith("(")
                        or raw[i + 1][:1].islower()
                        or re.match(
                            r"^(NEUTRO|TERRA|NORMAL|REVERSO|BF|FALHA)\b",
                            raw[i + 1],
                            re.I,
                        )
                    )
                )
            )
        ):
            cur = f"{cur} {raw[i + 1]}".strip()
            i += 1
        merged.append(cur)
        i += 1
    return merged


def item_tipo(pergunta: str, secao: str) -> str:
    if "disponibilidade" in secao.lower() or pergunta.lower().startswith("disponibilidade"):
        return "check"
    return "medicao"


def is_classe_i_line(ln: str) -> bool:
    u = ln.strip().upper()
    return u == "CLASSE I" or u == "CLASSE I."


def is_classe_ii_line(ln: str) -> bool:
    u = ln.strip().upper()
    return u.startswith("CLASSE II")


def extract_items(doc: fitz.Document) -> list[dict]:
    lines = normalize_lines(annex_text(doc))
    has_classes = any(is_classe_i_line(ln) or is_classe_ii_line(ln) for ln in lines)

    classe = "CLASSE I" if has_classes else "FORMULÁRIO"
    section = "01 DISPONIBILIDADE DO EQUIPAMENTO"
    secao_ordem = 1
    counts: dict[str, int] = {}
    items: list[dict] = []
    seen: set[str] = set()
    in_form = not has_classes  # formulário único começa no primeiro item/seção

    for ln in lines:
        if is_classe_i_line(ln):
            classe = "CLASSE I"
            in_form = True
            continue
        if is_classe_ii_line(ln):
            classe = "CLASSE II"
            in_form = True
            continue

        if SECTION_RE.match(ln):
            in_form = True
            section = ln
            secao_ordem = int(ln[:2])
            continue

        if not in_form:
            continue

        if ln.upper().startswith("OBSERVA"):
            continue
        if "PROCEDIMENTO:" in ln:
            continue
        if is_noise(ln):
            continue
        if len(ln) > 140 or len(ln) < 4:
            continue
        if re.match(r"^\d{2}\s+", ln):
            continue

        secao_label = f"{classe} · {section}" if has_classes else section
        key = f"{secao_label}|{ln.lower()}"
        if key in seen:
            continue
        seen.add(key)

        counts[secao_label] = counts.get(secao_label, 0) + 1
        n = counts[secao_label]
        items.append(
            {
                "id": f"tmp-{n}",
                "secao": secao_label,
                "secaoOrdem": secao_ordem + (0 if classe != "CLASSE II" else 100),
                "pergunta": ln,
                "tipo": item_tipo(ln, section),
            }
        )

    for i, it in enumerate(items, 1):
        if it["secao"].startswith("CLASSE II"):
            prefix = "CII"
        elif it["secao"].startswith("CLASSE I"):
            prefix = "CI"
        else:
            prefix = "TSE"
        it["id"] = f"{prefix}-{it['secaoOrdem']:03d}-{i:03d}"

    return items


def count_classe(items: list[dict], which: str) -> int:
    if which == "I":
        return sum(1 for x in items if x["secao"].startswith("CLASSE I ·"))
    if which == "II":
        return sum(1 for x in items if x["secao"].startswith("CLASSE II ·"))
    return sum(1 for x in items if not x["secao"].startswith("CLASSE "))


def process_pdf(path: Path) -> dict | None:
    m = FILE_RE.match(path.name)
    if not m:
        return None
    num, slug = m.group(1), m.group(2)
    codigo = f"POP.EC.SEG.{num}"
    doc = fitz.open(str(path))
    meses = extract_periodicity(doc)
    items = extract_items(doc)

    cleaned = []
    seen = set()
    for it in items:
        p = it["pergunta"].strip()
        if is_noise(p) or len(p) < 4:
            continue
        k = f"{it['secao']}|{p.lower()}"
        if k in seen:
            continue
        seen.add(k)
        cleaned.append({**it, "pergunta": p})

    return {
        "codigoPop": codigo,
        "nome": f"TSE — {humanize(slug)} ({codigo})",
        "tipo": "TSE",
        "validadeMeses": meses,
        "fonte": f"Anexo A · {codigo}",
        "itens": cleaned,
        "_meta": {
            "arquivo": path.name,
            "itens": len(cleaned),
            "pages": doc.page_count,
            "classeI": count_classe(cleaned, "I"),
            "classeII": count_classe(cleaned, "II"),
        },
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(PDF_DIR.glob("POP.EC.SEG.*.pdf"))
    print(f"[extract-tse] {len(files)} PDFs")
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
            # SEG.010 tem formulário curto dedicado
            min_ok = 5 if data["codigoPop"].endswith(".010") else 15
            flag = "OK" if min_ok <= n <= 120 else "WEAK"
            if flag == "WEAK":
                weak.append(f"{data['codigoPop']}:{n}")
            print(
                f"[{flag}] {data['codigoPop']} · {n} "
                f"(I={meta['classeI']} II={meta['classeII']}) · {data['validadeMeses']}m"
            )
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
