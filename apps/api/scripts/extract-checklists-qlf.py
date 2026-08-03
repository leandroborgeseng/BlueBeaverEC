#!/usr/bin/env python3
"""Extrai checklists de qualificação dos POP.EC.QLF.* → JSON.

Dois formatos nos PDFs:
- Formulário operacional (cabine/capela): seções 01..N com C/N.C e medições
- Protocolo térmico (autoclave/câmara/estufa…): tabela de verificações + template de estudos
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "scripts/dados/pops-biblioteca"
OUT_DIR = ROOT / "scripts/dados/checklists-qualificacao"

FILE_RE = re.compile(r"^POP\.EC\.QLF\.(\d+)_(.+)\.pdf$", re.I)
SECTION_RE = re.compile(r"^(\d{2})\s+(\S.+)$")
MESES_RE = re.compile(r"é de\s+(\d+)\s*(?:\([^)]*\))?\s*meses", re.I)

NOISE = re.compile(
    r"^(Tipo do|Documento|Título|PROCEDIMENTO|POP\.EC|Emissão|Versão|Próxima|"
    r"Modelo:|Fabricante:|Código de ID:|Nº de|Setor/|EXECUÇÃO|Hora:|"
    r"EQUIPAMENTO INSPECIONADO|ANEXO [A-Z]|Elaboração|Revisão|Validação|"
    r"Aprovação|Data:|QUALIFICAÇÃO|AION ENGENHARIA|Página \d|"
    r"Formulário|Item a ser|Conformidade$|Ponto$|m/s$|Leitura$|"
    r"Valor medido|Ponto de medição|Velocidade \(m/s\)|Velocidade Nominal|"
    r"Tamanho da partícula|Verificações$|Verificação$|Observações$|"
    r"Legenda:|Fonte:|TERMOPARES|XXXX|C$|N\.C$)",
    re.I,
)

THERMAL_TEMPLATE = [
    ("01 PRÉ-REQUISITOS", "check", "Validade da calibração de válvulas/manômetros"),
    ("01 PRÉ-REQUISITOS", "check", "Validade da manutenção preventiva"),
    ("01 PRÉ-REQUISITOS", "check", "Histórico Bowie & Dick (últimos 30 dias)"),
    ("02 ESTANQUEIDADE", "check", "Teste de estanqueidade inicial"),
    ("02 ESTANQUEIDADE", "check", "Teste de estanqueidade final"),
    ("03 BOWIE & DICK", "check", "Ciclo Bowie & Dick aprovado"),
    ("04 DISTRIBUIÇÃO TÉRMICA SEM CARGA", "medicao", "Ciclo 1 — temperatura mínima (°C)"),
    ("04 DISTRIBUIÇÃO TÉRMICA SEM CARGA", "medicao", "Ciclo 1 — temperatura máxima (°C)"),
    ("04 DISTRIBUIÇÃO TÉRMICA SEM CARGA", "medicao", "Ciclo 1 — temperatura média (°C)"),
    ("04 DISTRIBUIÇÃO TÉRMICA SEM CARGA", "medicao", "Ciclo 2 — temperatura mínima (°C)"),
    ("04 DISTRIBUIÇÃO TÉRMICA SEM CARGA", "medicao", "Ciclo 2 — temperatura máxima (°C)"),
    ("04 DISTRIBUIÇÃO TÉRMICA SEM CARGA", "medicao", "Ciclo 2 — temperatura média (°C)"),
    ("04 DISTRIBUIÇÃO TÉRMICA SEM CARGA", "medicao", "Ciclo 3 — temperatura mínima (°C)"),
    ("04 DISTRIBUIÇÃO TÉRMICA SEM CARGA", "medicao", "Ciclo 3 — temperatura máxima (°C)"),
    ("04 DISTRIBUIÇÃO TÉRMICA SEM CARGA", "medicao", "Ciclo 3 — temperatura média (°C)"),
    ("05 PENETRAÇÃO TÉRMICA COM CARGA", "medicao", "Ciclo 1 — temperatura mínima (°C)"),
    ("05 PENETRAÇÃO TÉRMICA COM CARGA", "medicao", "Ciclo 1 — temperatura máxima (°C)"),
    ("05 PENETRAÇÃO TÉRMICA COM CARGA", "medicao", "Ciclo 1 — temperatura média (°C)"),
    ("05 PENETRAÇÃO TÉRMICA COM CARGA", "medicao", "Ciclo 2 — temperatura mínima (°C)"),
    ("05 PENETRAÇÃO TÉRMICA COM CARGA", "medicao", "Ciclo 2 — temperatura máxima (°C)"),
    ("05 PENETRAÇÃO TÉRMICA COM CARGA", "medicao", "Ciclo 2 — temperatura média (°C)"),
    ("05 PENETRAÇÃO TÉRMICA COM CARGA", "medicao", "Ciclo 3 — temperatura mínima (°C)"),
    ("05 PENETRAÇÃO TÉRMICA COM CARGA", "medicao", "Ciclo 3 — temperatura máxima (°C)"),
    ("05 PENETRAÇÃO TÉRMICA COM CARGA", "medicao", "Ciclo 3 — temperatura média (°C)"),
    ("06 INDICADORES", "check", "Indicadores biológicos aprovados"),
    ("06 INDICADORES", "check", "Integradores químicos aprovados"),
    ("06 INDICADORES", "medicao", "Letalidade F0 mínima (min)"),
    ("07 CONCLUSÃO", "check", "Equipamento qualificado / aprovado"),
]


def humanize(slug: str) -> str:
    s = slug.replace("_", " ")
    s = re.sub(r"([a-zà-ú])([A-ZÁ-Ú])", r"\1 \2", s)
    return re.sub(r"\s+", " ", s).strip()


def extract_periodicity(doc: fitz.Document) -> int:
    blob = "\n".join((doc[i].get_text() or "") for i in range(min(14, doc.page_count)))
    m = MESES_RE.search(blob)
    if m:
        n = int(m.group(1))
        if 1 <= n <= 24:
            return n
    return 12


def is_noise(ln: str) -> bool:
    t = ln.strip()
    if len(t) < 2:
        return True
    if NOISE.match(t):
        return True
    if "janeiro de" in t.lower() or "www.aion" in t.lower():
        return True
    if "PROCEDIMENTO:" in t or "........" in t:
        return True
    if re.fullmatch(r"\d{1,3}", t):
        return True
    return False


def is_thermal_protocol(doc: fitz.Document) -> bool:
    blob = "\n".join((doc[i].get_text() or "") for i in range(doc.page_count))
    return "PROTOCOLO DE QUALIFICAÇÃO TÉRMICA" in blob or (
        "distribuição térmica" in blob.lower() and "ANEXO A – Protocolo" in blob
    )


def find_operational_form_start(doc: fitz.Document) -> int | None:
    """Formulário operacional (cabine etc.) — não protocolo térmico nem termopar."""
    for i in range(doc.page_count):
        t = doc[i].get_text() or ""
        if "........" in t[:300]:
            continue
        if "termopar" in t.lower() and "ANEXO B" in t:
            continue
        if "PROTOCOLO DE QUALIFICAÇÃO TÉRMICA" in t:
            continue
        if ("ANEXO A" in t or "Formulário de coleta" in t or "Formulário para coleta" in t) and (
            "Item a ser verificado" in t or "DADOS DO EQUIPAMENTO" in t or "DADOS DE MANUTENÇÃO" in t
        ):
            return i
        if "Item a ser verificado" in t and "Conformidade" in t and i >= doc.page_count * 0.5:
            return i
    return None


def section_mode(section: str) -> str:
    u = section.upper()
    if "DADOS DO EQUIPAMENTO" in u:
        return "texto"
    if any(k in u for k in ("MANUTENÇÃO", "MANUTENCAO", "FUNCIONAMENTO", "FUMAÇA", "FUMACA", "CIRCULA")):
        return "check"
    if any(
        k in u
        for k in (
            "VELOCIDADE",
            "DOWNFLOW",
            "INFLOW",
            "PARTÍCULA",
            "PARTICULA",
            "CONTAGEM",
            "CONCENTRA",
            "LUMINOS",
            "ILUMIN",
            "RUÍDO",
            "RUIDO",
            "VIBRA",
            "TEMPERATURA",
            "PRESSÃO",
            "PRESSAO",
        )
    ):
        return "medicao"
    return "check"


def parse_looks_section(ln: str) -> bool:
    if re.match(r"^\d{2}\s+\d", ln):
        return False
    return bool(
        re.match(
            r"^\d{2}\s+(DADOS|DISPONIBILIDADE|VERIFICA|CONTAGEM|CONCENTRA|TESTE|"
            r"TEMPERATURA|PRESSÃO|PRESSAO|CICLO|INTEGRIDADE|MANUTEN|FUNCIONAMENTO|"
            r"ILUMIN|LUMINOS|RUÍDO|RUIDO|VIBRA|FLUXO|PARTÍC|VELOCIDADE|DOWNFLOW|"
            r"INFLOW|QUALIFICA|ENSAIO|DESEMPENHO|SEGURANÇA|SEGURANCA|CIRCULA)",
            ln,
            re.I,
        )
        or re.match(r"^\d{2}\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}", ln)
    )


def extract_operational(doc: fitz.Document, start: int) -> list[dict]:
    lines: list[str] = []
    for i in range(start, doc.page_count):
        t = doc[i].get_text() or ""
        if i > start and "ANEXO B" in t and "termopar" in t.lower():
            break
        if i > start and "PROTOCOLO DE QUALIFICAÇÃO TÉRMICA" in t:
            break
        for ln in t.splitlines():
            s = re.sub(r"\s+", " ", ln).strip()
            if s:
                lines.append(s)

    section = "01 FORMULÁRIO"
    secao_ordem = 1
    mode = "check"
    items: list[dict] = []
    seen: set[str] = set()
    in_form = False
    grid_done: set[str] = set()

    for ln in lines:
        if SECTION_RE.match(ln) and len(ln) < 120 and parse_looks_section(ln):
            section = ln
            secao_ordem = int(ln[:2])
            mode = section_mode(ln)
            in_form = True
            continue
        if not in_form:
            continue
        if ln.upper().startswith("OBSERVA") and len(ln) < 20:
            continue
        if is_noise(ln):
            continue

        if mode == "medicao" and section not in grid_done:
            u = section.upper()
            if "DOWNFLOW" in u:
                for n in range(1, 31):
                    items.append(
                        {
                            "id": "tmp",
                            "secao": section,
                            "secaoOrdem": secao_ordem,
                            "pergunta": f"Ponto {n}",
                            "tipo": "medicao",
                            "unidade": "m/s",
                        }
                    )
                grid_done.add(section)
                continue
            if "INFLOW" in u:
                for n in range(1, 11):
                    items.append(
                        {
                            "id": "tmp",
                            "secao": section,
                            "secaoOrdem": secao_ordem,
                            "pergunta": f"Ponto {n}",
                            "tipo": "medicao",
                            "unidade": "m/s",
                        }
                    )
                grid_done.add(section)
                continue
            if "LUMINOS" in u or "ILUMIN" in u:
                for n in range(1, 6):
                    items.append(
                        {
                            "id": "tmp",
                            "secao": section,
                            "secaoOrdem": secao_ordem,
                            "pergunta": f"Ponto {n}",
                            "tipo": "medicao",
                            "unidade": "lux",
                        }
                    )
                grid_done.add(section)
                continue

        if mode == "medicao" and re.match(r"^0,[35]\s*µm$", ln, re.I):
            key = f"{section}|{ln.lower()}"
            if key not in seen:
                seen.add(key)
                items.append(
                    {
                        "id": "tmp",
                        "secao": section,
                        "secaoOrdem": secao_ordem,
                        "pergunta": ln,
                        "tipo": "medicao",
                    }
                )
            continue

        if mode in {"check", "texto"}:
            if len(ln) < 4 or len(ln) > 100 or re.match(r"^\d", ln):
                continue
            key = f"{section}|{ln.lower()}"
            if key in seen:
                continue
            seen.add(key)
            items.append(
                {
                    "id": "tmp",
                    "secao": section,
                    "secaoOrdem": secao_ordem,
                    "pergunta": ln,
                    "tipo": "check" if mode == "check" else "texto",
                }
            )

    return renumber(items)


def extract_verificacao_table(doc: fitz.Document) -> list[dict]:
    """Linhas C/N.C de tabelas 'Verificação' no protocolo."""
    raw: list[str] = []
    capturing = False
    for i in range(doc.page_count):
        t = doc[i].get_text() or ""
        lines = [re.sub(r"\s+", " ", ln).strip() for ln in t.splitlines() if ln.strip()]
        for ln in lines:
            if re.match(r"^Verificação$", ln, re.I) or "Tabela 3" in ln:
                capturing = True
                continue
            if capturing and re.match(r"^(Legenda|3 INSUMOS|4 METODOLOGIA|Fonte:)", ln):
                capturing = False
                continue
            if not capturing:
                continue
            if is_noise(ln) or ln in {"C", "N.C", "Observações"}:
                continue
            if 3 <= len(ln) <= 120 and not ln.startswith("Tabela"):
                raw.append(ln)

    # juntar quebras
    merged: list[str] = []
    i = 0
    while i < len(raw):
        cur = raw[i]
        while (
            i + 1 < len(raw)
            and (
                cur.lower().endswith((" e", " de", " do", " da", " dos", " das"))
                or raw[i + 1][:1].islower()
            )
            and len(cur) < 80
        ):
            cur = f"{cur} {raw[i + 1]}".strip()
            i += 1
        merged.append(cur)
        i += 1

    items: list[dict] = []
    seen: set[str] = set()
    for ln in merged:
        if len(ln) < 8:
            continue
        k = ln.lower()
        if k in seen:
            continue
        seen.add(k)
        items.append(
            {
                "id": "tmp",
                "secao": "01 PRÉ-REQUISITOS (protocolo)",
                "secaoOrdem": 1,
                "pergunta": ln,
                "tipo": "check",
            }
        )
    return items


def extract_criterios(doc: fitz.Document) -> list[str]:
    out: list[str] = []
    capturing = False
    for i in range(doc.page_count):
        t = doc[i].get_text() or ""
        if "CRITÉRIOS DE ACEITAÇÃO" in t or "Critérios de aceitação" in t or "Quadro 2" in t:
            capturing = True
        if not capturing:
            continue
        for ln in t.splitlines():
            s = re.sub(r"\s+", " ", ln).strip()
            if re.match(r"^6 |^7 |^Fonte:|^APROVAÇÃO|^Observações$", s):
                capturing = False
                break
            if is_noise(s) or len(s) < 12:
                continue
            if any(k in s.lower() for k in ("temperatura", "pressão", "pressao", "tempo", "f0", "letalidade", "uniformidade", "±", "delta")):
                out.append(s)
    # unique
    seen = set()
    uniq = []
    for x in out:
        k = x.lower()
        if k not in seen:
            seen.add(k)
            uniq.append(x)
    return uniq[:20]


def thermal_items(doc: fitz.Document) -> list[dict]:
    extras = extract_verificacao_table(doc)
    base = []
    for secao, tipo, pergunta in THERMAL_TEMPLATE:
        # skip template pré-requisitos if we already extracted table lines
        if secao.startswith("01 ") and extras:
            continue
        base.append(
            {
                "id": "tmp",
                "secao": secao,
                "secaoOrdem": int(secao[:2]),
                "pergunta": pergunta,
                "tipo": tipo,
                "unidade": "°C" if "temperatura" in pergunta.lower() else ("min" if "F0" in pergunta or "Letalidade" in pergunta else None),
            }
        )
    items = extras + base
    # drop None unidade
    for it in items:
        if it.get("unidade") is None:
            it.pop("unidade", None)
    return renumber(items)


def renumber(items: list[dict]) -> list[dict]:
    counts: dict[int, int] = {}
    for it in items:
        o = int(it["secaoOrdem"])
        counts[o] = counts.get(o, 0) + 1
        it["id"] = f"{o:02d}-{counts[o]:02d}"
    return items


def process_pdf(path: Path) -> dict | None:
    m = FILE_RE.match(path.name)
    if not m:
        return None
    num, slug = m.group(1), m.group(2)
    codigo = f"POP.EC.QLF.{num}"
    doc = fitz.open(str(path))
    meses = extract_periodicity(doc)

    form_start = find_operational_form_start(doc)
    if form_start is not None and not (
        is_thermal_protocol(doc) and "DADOS DO EQUIPAMENTO" not in (doc[form_start].get_text() or "")
    ):
        # operacional se achou formulário com dados/item
        t0 = doc[form_start].get_text() or ""
        if "DADOS DO EQUIPAMENTO" in t0 or "Item a ser verificado" in t0:
            items = extract_operational(doc, form_start)
            fonte = f"Anexo A formulário · {codigo}"
            criterios: list[str] = []
        else:
            items = thermal_items(doc)
            fonte = f"Protocolo térmico + template estudos · {codigo}"
            criterios = extract_criterios(doc)
    elif is_thermal_protocol(doc):
        items = thermal_items(doc)
        fonte = f"Protocolo térmico + template estudos · {codigo}"
        criterios = extract_criterios(doc)
    else:
        items = thermal_items(doc)
        fonte = f"Template qualificação · {codigo}"
        criterios = extract_criterios(doc)

    return {
        "codigoPop": codigo,
        "nome": f"Qualificação — {humanize(slug)} ({codigo})",
        "tipo": "QUALIFICACAO",
        "validadeMeses": meses,
        "fonte": fonte,
        "criteriosAceitacao": criterios,
        "nota": (
            "Protocolos térmicos usam template de estudos (estanqueidade, Bowie & Dick, "
            "distribuição/penetração). Cálculos F0 e mapeamento completo de sensores "
            "permanecem no relatório/planilha de qualificação."
        ),
        "itens": items,
        "_meta": {
            "arquivo": path.name,
            "itens": len(items),
            "checks": sum(1 for i in items if i.get("tipo") == "check"),
            "medicoes": sum(1 for i in items if i.get("tipo") == "medicao"),
            "pages": doc.page_count,
        },
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(PDF_DIR.glob("POP.EC.QLF.*.pdf"))
    print(f"[extract-qlf] {len(files)} PDFs")
    weak, errors = [], []
    for f in files:
        try:
            data = process_pdf(f)
            assert data
            meta = data.pop("_meta")
            (OUT_DIR / f"{data['codigoPop']}.json").write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            flag = "OK" if meta["itens"] >= 8 else "WEAK"
            if flag == "WEAK":
                weak.append(f"{data['codigoPop']}:{meta['itens']}")
            print(
                f"[{flag}] {data['codigoPop']} · {meta['itens']} "
                f"(check={meta['checks']} med={meta['medicoes']}) · {data['validadeMeses']}m"
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
