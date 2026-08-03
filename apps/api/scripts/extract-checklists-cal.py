#!/usr/bin/env python3
"""Extrai checklists de calibração (Anexo A + Quadro 7) dos POP.EC.CAL.* → JSON."""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "scripts/dados/pops-biblioteca"
OUT_DIR = ROOT / "scripts/dados/checklists-calibracao"

FILE_RE = re.compile(r"^POP\.EC\.CAL\.(\d+)_(.+)\.pdf$", re.I)
SECTION_RE = re.compile(r"^(\d{2})\s+(\S.+)$")
MESES_RE = re.compile(r"é de\s+(\d+)\s*(?:\([^)]*\))?\s*meses", re.I)
TOL_TOKEN_RE = re.compile(
    r"[±]\s*([\d.,]+)\s*(%|°C|ºC|mmHg|kPa|BPM|J|ml|mL|Kg|kg|g|s|pontos?|ppm|dB|Hz|V|mV|W|hPa|mm)?",
    re.I,
)
UNIT = (
    r"°C|ºC|C|mmHg|cmH2O|cmH₂O|kPa|BPM|bpm|J|m[lL]|[Kk]g|g|s|%|Hz|dB|m?V|W|hPa|lpm|L/?min|"
    r"mm|cm|µ[lL]|u[lL]|psi|bar|mA|A|Ω|ohm|rpm|min|h|L|mbar|SpO2\s*\(%\)|SpO₂\s*\(%\)"
)
NOMINAL_RE = re.compile(
    rf"^(-?[\d]+(?:[.,]\d+)+)\s*({UNIT})?\s*$|"
    rf"^(-?[\d]+)\s+({UNIT})\s*$|"
    rf"^(-?[\d]+(?:[.,]\d+)*)({UNIT})\s*$|"
    rf"^(-?[\d]+(?:[.,]\d+)*)\s+SpO2\s*\(%\)\s*$|"
    rf"^(-?[\d]+(?:[.,]\d+)*)\s+SpO₂\s*\(%\)\s*$",
    re.I,
)

HEADER_NOISE = re.compile(
    r"^(Tipo do|Documento|Título|PROCEDIMENTO|POP\.EC|Emissão|Versão|Próxima|"
    r"Modelo:|Fabricante:|Código de ID:|Nº de|Setor/|EXECUÇÃO|Hora:|"
    r"EQUIPAMENTO INSPECIONADO|ANEXO A|Elaboração|Revisão|Validação|"
    r"Aprovação|Data:|CALIBRAÇÃO DE|AION ENGENHARIA|Página \d|"
    r"Formulário|Legenda|Valor Nominal|Valor medido|Item a ser|"
    r"C$|N\.C$|Observações$|OBSERVAÇÕES)",
    re.I,
)


def humanize(slug: str) -> str:
    s = slug.replace("_", " ")
    s = re.sub(r"([a-zà-ú])([A-ZÁ-Ú])", r"\1 \2", s)
    return re.sub(r"\s+", " ", s).strip()


def norm_num(s: str) -> float:
    return float(s.replace(".", "").replace(",", ".") if s.count(",") == 1 and s.count(".") > 1
                 else s.replace(",", "."))


def parse_nominal(ln: str) -> tuple[float, str] | None:
    t = re.sub(r"\s+", " ", ln).strip()
    # reject bare page numbers / years (allow negatives like -10)
    if re.fullmatch(r"-?\d{1,4}", t):
        return None
    # SpO2 informal
    m_spo = re.match(r"^(-?[\d]+(?:[.,]\d+)*)\s+SpO[2₂]\s*\(%\)\s*$", t, re.I)
    if m_spo:
        try:
            return norm_num(m_spo.group(1)), "SpO2(%)"
        except ValueError:
            return None
    m = NOMINAL_RE.match(t)
    if not m:
        return None
    groups = [g for g in m.groups() if g is not None]
    if len(groups) == 1:
        try:
            return norm_num(groups[0]), ""
        except ValueError:
            return None
    num_s, unit = groups[0], groups[1]
    try:
        return norm_num(num_s), unit
    except ValueError:
        return None


def extract_periodicity(doc: fitz.Document) -> int:
    blob = "\n".join((doc[i].get_text() or "") for i in range(min(12, doc.page_count)))
    m = MESES_RE.search(blob)
    if m:
        n = int(m.group(1))
        if 1 <= n <= 24:
            return n
    return 12


def annex_start(doc: fitz.Document) -> int:
    for i in range(doc.page_count):
        t = doc[i].get_text() or ""
        if "ANEXO A" in t and ("DISPONIBILIDADE" in t or "Item a ser" in t):
            return i
    for i in range(doc.page_count):
        t = doc[i].get_text() or ""
        if "Item a ser verificado" in t and "Valor Nominal" in t:
            return i
    return max(0, doc.page_count - 4)


def is_noise(ln: str) -> bool:
    t = ln.strip()
    if len(t) < 2:
        return True
    if HEADER_NOISE.match(t):
        return True
    if "janeiro de" in t.lower() or "www.aion" in t.lower():
        return True
    if "PROCEDIMENTO:" in t:
        return True
    return False


def parse_tol_token(token: str) -> dict | None:
    m = TOL_TOKEN_RE.search(token)
    if not m:
        return None
    valor = norm_num(m.group(1))
    unidade = (m.group(2) or "").strip()
    modo = "percentual" if unidade == "%" else "absoluto"
    if unidade.lower().startswith("ponto"):
        unidade = "pontos"
    return {
        "valor": valor,
        "modo": modo,
        "unidade": unidade,
        "texto": re.sub(r"\s+", "", token if "±" in token else f"±{m.group(0)}"),
    }


def extract_tolerancias(doc: fitz.Document) -> list[dict]:
    """Quadro 7 — pares parâmetro / tolerância (quando o valor está em texto)."""
    out: list[dict] = []
    for i in range(doc.page_count):
        t = doc[i].get_text() or ""
        if "Quadro 7" not in t and "Tolerâncias sugeridas" not in t:
            continue
        lines = [re.sub(r"\s+", " ", ln).strip() for ln in t.splitlines() if ln.strip()]
        if i + 1 < doc.page_count:
            t2 = doc[i + 1].get_text() or ""
            lines += [re.sub(r"\s+", " ", ln).strip() for ln in t2.splitlines() if ln.strip()]

        start = 0
        for j, ln in enumerate(lines):
            if "Quadro 7" in ln or "Tolerâncias sugeridas" in ln:
                start = j
                break
        body = []
        past = False
        for ln in lines[start:]:
            if re.match(r"^Fonte:|^7 REGISTRO|^8 REFER|^7\.1", ln):
                break
            if is_noise(ln) or ln in {"Parâmetro", "Tolerância sugerida", "Tolerância"}:
                past = True
                continue
            if "Quadro 7" in ln or "Segue no Quadro" in ln or "Tolerâncias sugeridas" in ln:
                continue
            if past or TOL_TOKEN_RE.search(ln):
                past = True
                body.append(ln)

        k = 0
        while k < len(body):
            ln = body[k]
            m = TOL_TOKEN_RE.search(ln)
            if m and len(ln) < 90:
                param = ln[: m.start()].strip(" :-–—")
                if not param and k > 0:
                    param = body[k - 1]
                if param and param not in {"Parâmetro", "Tolerância sugerida"} and "de 2026" not in param:
                    tol = parse_tol_token(m.group(0))
                    if tol:
                        out.append({"parametro": param, **tol})
                k += 1
                continue
            if k + 1 < len(body) and TOL_TOKEN_RE.search(body[k + 1]) and not TOL_TOKEN_RE.search(ln):
                tol = parse_tol_token(TOL_TOKEN_RE.search(body[k + 1]).group(0))
                if tol and len(ln) < 80 and not ln.startswith("±"):
                    out.append({"parametro": ln, **tol})
                k += 2
                continue
            # parâmetro sem valor numérico (imagem) — registrar só o nome
            if (
                len(ln) < 60
                and not re.match(r"^\d", ln)
                and "±" not in ln
                and ln.lower() not in {o["parametro"].lower() for o in out}
            ):
                # só se parece nome de parâmetro (sem pontuação longa)
                if re.match(r"^[A-Za-zÀ-ú0-9][A-Za-zÀ-ú0-9\s\-/]{2,50}$", ln):
                    out.append(
                        {
                            "parametro": ln,
                            "valor": None,
                            "modo": None,
                            "unidade": None,
                            "texto": None,
                        }
                    )
            k += 1
        if out:
            break

    # dedup preferindo entradas com valor
    best: dict[str, dict] = {}
    for row in out:
        key = row["parametro"].lower()
        prev = best.get(key)
        if not prev or (prev.get("valor") is None and row.get("valor") is not None):
            best[key] = row
    return list(best.values())


def extract_padroes(doc: fitz.Document) -> list[str]:
    names: list[str] = []
    capturing = False
    for i in range(min(8, doc.page_count)):
        t = doc[i].get_text() or ""
        if "Quadro 2" in t or "5.1 Padrões" in t or "5.1 Padroes" in t:
            capturing = True
        if not capturing:
            continue
        lines = [re.sub(r"\s+", " ", ln).strip() for ln in t.splitlines() if ln.strip()]
        for ln in lines:
            if re.match(r"^5\.2 |^6 |^Fonte:", ln):
                capturing = False
                break
            if ln in {"Padrão", "Especificações", "Quadro 2 – Lista e especificações de padrões necessários."}:
                continue
            if capturing and 3 < len(ln) < 60 and not ln.startswith("Equipamento com"):
                if re.match(
                    r"^(Termo|Analisador|Simulador|Manômetro|Peso|Massa|Padrão|Multímetro|"
                    r"Osciloscópio|Gerador|Balão|Fotômetro|Dosímetro|Decibelímetro|"
                    r"Ventilômetro|Fluxômetro|Cronômetro|Balança|Pipeta|Espectro)",
                    ln,
                    re.I,
                ):
                    names.append(ln)
        if not capturing and names:
            break
    # unique preserve order
    seen = set()
    out = []
    for n in names:
        k = n.lower()
        if k not in seen:
            seen.add(k)
            out.append(n)
    return out[:12]


def fold(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower()


def match_tolerancia(
    secao: str, tols: list[dict], valor: float | None = None
) -> dict | None:
    # match por ponto nominal (ex.: pipeta Quadro 7 com "5,00 ml" ±0,01)
    if valor is not None:
        for tol in tols:
            if tol.get("valor") is None:
                continue
            nom = parse_nominal(tol["parametro"])
            if nom and abs(nom[0] - valor) < 1e-9:
                return tol

    sf = fold(secao)
    best = None
    best_score = 0
    for tol in tols:
        if tol.get("valor") is None:
            continue
        pf = fold(tol["parametro"])
        # ignorar "parametro" que é só um número/unidade
        if parse_nominal(tol["parametro"]):
            continue
        score = 0
        if pf in sf:
            score = len(pf)
        else:
            words = [w for w in re.split(r"\W+", pf) if len(w) > 3]
            score = sum(4 for w in words if w in sf)
        if score > best_score:
            best_score = score
            best = tol
    return best


def extract_items(doc: fitz.Document, tols: list[dict]) -> list[dict]:
    start = annex_start(doc)
    raw_lines: list[str] = []
    for i in range(start, doc.page_count):
        for ln in (doc[i].get_text() or "").splitlines():
            s = re.sub(r"\s+", " ", ln).strip()
            if s:
                raw_lines.append(s)

    section = "01 DISPONIBILIDADE DO EQUIPAMENTO"
    secao_ordem = 1
    items: list[dict] = []
    seen: set[str] = set()
    in_form = False
    mode = "check"  # check | ambient | calibracao

    for ln in raw_lines:
        if (
            SECTION_RE.match(ln)
            and "Item a ser" not in ln
            and len(ln) < 120
            and parse_nominal(ln) is None
        ):
            # evita tratar "90 SpO2 (%)" / "60 BPM" como seção
            if re.match(
                r"^\d{2}\s+(DISPONIBILIDADE|CONDIÇÕES|CALIBRA|TEMPERATURA|PRESSÃO|PRESSAO|"
                r"NÍVEIS|NIVEIS|FREQUÊNCIA|FREQUENCIA|VOLUME|TEMPO|POTÊNCIA|POTENCIA|"
                r"LEITURA|SATURAÇÃO|SATURACAO|ENERGIA|VAZÃO|VAZAO|FLUXO|MASSA|"
                r"PADRÃO|PADRAO|LARGURA|IRRADIÂNCIA|IRRADIANCIA|CAPNO|DÉBITO|DEBITO|"
                r"OXIGÊNIO|OXIGENIO|OXIMETRIA|CORTE|COAGULA|BIPOLAR|SISTÓLICA|SISTOLICA|"
                r"DIASTÓLICA|DIASTOLICA|PULSO|CARDÍACA|CARDIACA|INVASIVA|"
                r"NÃO INVASIVA|NAO INVASIVA|ALTURA|PESO|VELOCIDADE|FORÇA|FORCA|"
                r"INTENSIDADE|AMPLITUDE|DURAÇÃO|DURACAO|CONCENTRA|UMIDADE|"
                r"ILUMINÂNCIA|ILUMINANCIA|COMPRIMENTO|DISTÂNCIA|DISTANCIA|"
                r"RESISTÊNCIA|RESISTENCIA|CORRENTE|TENSÃO|TENSAO|RPM|CICLO)",
                ln,
                re.I,
            ) or (
                re.match(r"^\d{2}\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3,}", ln)
                and not re.match(r"^\d{2}\s+\d", ln)
            ):
                section = ln
                secao_ordem = int(ln[:2])
                in_form = True
                if "DISPONIBILIDADE" in ln.upper():
                    mode = "check"
                elif "CONDIÇÕES AMBIENTAIS" in ln.upper() or "CONDICOES AMBIENTAIS" in fold(ln):
                    mode = "ambient"
                else:
                    mode = "calibracao"
                continue

        if not in_form:
            if "DISPONIBILIDADE" in ln.upper() and SECTION_RE.match(ln):
                in_form = True
            continue

        if ln.upper().startswith("OBSERVA") and len(ln) < 20:
            continue
        if is_noise(ln):
            continue

        if mode == "check":
            if ln.lower().startswith("disponibilidade"):
                key = f"{section}|{ln.lower()}"
                if key not in seen:
                    seen.add(key)
                    items.append(
                        {
                            "id": f"{secao_ordem:02d}-01",
                            "secao": section,
                            "secaoOrdem": secao_ordem,
                            "pergunta": "Disponibilidade do equipamento",
                            "tipo": "check",
                        }
                    )
            continue

        if mode == "ambient":
            if ln.lower().startswith("temperatura") or ln.lower().startswith("umidade"):
                key = f"{section}|{ln.lower()}"
                if key in seen:
                    continue
                seen.add(key)
                unidade = "°C" if "temperatura" in ln.lower() else "%UR"
                items.append(
                    {
                        "id": f"{secao_ordem:02d}-{len([x for x in items if x['secaoOrdem']==secao_ordem])+1:02d}",
                        "secao": section,
                        "secaoOrdem": secao_ordem,
                        "pergunta": ln,
                        "tipo": "medicao",
                        "unidade": unidade,
                    }
                )
            continue

        # calibracao — pontos nominais
        nom = parse_nominal(ln)
        if not nom:
            continue
        valor, unidade = nom
        pergunta = f"{ln}" if unidade or "," in ln else f"{valor}"
        key = f"{section}|{valor}|{unidade}|{pergunta.lower()}"
        # allow same nominal in different sections; within section allow duplicates only if different label
        if key in seen:
            continue
        seen.add(key)

        tol = match_tolerancia(section, tols, valor)
        n = len([x for x in items if x["secaoOrdem"] == secao_ordem]) + 1
        item: dict = {
            "id": f"{secao_ordem:02d}-{n:02d}",
            "secao": section,
            "secaoOrdem": secao_ordem,
            "pergunta": ln,
            "tipo": "calibracao",
            "valorPadrao": valor,
            "unidade": unidade,
            "repeticoes": 3,
        }
        if tol:
            item["tolerancia"] = {
                "valor": tol["valor"],
                "modo": tol["modo"],
                "unidade": tol.get("unidade") or unidade,
                "texto": tol.get("texto"),
                "parametro": tol["parametro"],
            }
            item["limite"] = tol["valor"]
        items.append(item)

    # renumber ids stably
    counts: dict[int, int] = {}
    for it in items:
        o = it["secaoOrdem"]
        counts[o] = counts.get(o, 0) + 1
        it["id"] = f"{o:02d}-{counts[o]:02d}"
    return items


def process_pdf(path: Path) -> dict | None:
    m = FILE_RE.match(path.name)
    if not m:
        return None
    num, slug = m.group(1), m.group(2)
    codigo = f"POP.EC.CAL.{num}"
    doc = fitz.open(str(path))
    meses = extract_periodicity(doc)
    tols = extract_tolerancias(doc)
    padroes = extract_padroes(doc)
    items = extract_items(doc, tols)

    cal_pts = sum(1 for i in items if i.get("tipo") == "calibracao")
    with_tol = sum(1 for i in items if i.get("tolerancia"))

    return {
        "codigoPop": codigo,
        "nome": f"Calibração — {humanize(slug)} ({codigo})",
        "tipo": "CALIBRACAO",
        "validadeMeses": meses,
        "fonte": f"Anexo A + Quadro 7 · {codigo}",
        "notaMetrologia": (
            "Conformidade neste laudo: média de até 3 leituras vs valor nominal, "
            "comparada à tolerância do Quadro 7 (absoluta ou %). "
            "Incerteza expandida dos padrões e planilha metrológica Aion permanecem "
            "como registro complementar quando aplicável."
        ),
        "tolerancias": tols,
        "padroesSugeridos": padroes,
        "itens": items,
        "_meta": {
            "arquivo": path.name,
            "itens": len(items),
            "pontosCalibracao": cal_pts,
            "comTolerancia": with_tol,
            "toleranciasQuadro7": len(tols),
            "pages": doc.page_count,
        },
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(PDF_DIR.glob("POP.EC.CAL.*.pdf"))
    print(f"[extract-cal] {len(files)} PDFs")
    weak, errors = [], []
    for f in files:
        try:
            data = process_pdf(f)
            assert data
            meta = data.pop("_meta")
            n = meta["pontosCalibracao"]
            (OUT_DIR / f"{data['codigoPop']}.json").write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            flag = "OK" if n >= 1 else "WEAK"
            if flag == "WEAK":
                weak.append(f"{data['codigoPop']}:{meta['itens']}")
            print(
                f"[{flag}] {data['codigoPop']} · itens={meta['itens']} "
                f"pts={n} tolItens={meta['comTolerancia']} "
                f"quadro7={meta['toleranciasQuadro7']} · {data['validadeMeses']}m"
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
