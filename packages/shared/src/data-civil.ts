/**
 * Datas civis (dia do calendário) para validade de certificados — fuso America/Sao_Paulo.
 *
 * Como a validade é gravada: o formulário usa <input type="date"> → "YYYY-MM-DD" → `new Date("YYYY-MM-DD")`
 * na API, que vira 00:00:00.000Z daquele dia (coluna DateTime, sem migração). Portanto:
 *  - valores só-data ("YYYY-MM-DD", ou DateTime exatamente à 00:00:00.000Z) valem pela parte UTC = dia digitado;
 *  - instantes (execução do serviço, "agora", ou qualquer DateTime com hora) valem pelo dia civil em São Paulo.
 * Comparação inclusiva: o certificado vale até o fim do dia civil da validade (execução ≤ validade).
 */
export const FUSO_SP = "America/Sao_Paulo";

const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
const fmtSP = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_SP, year: "numeric", month: "2-digit", day: "2-digit" });

/** Dia civil em São Paulo de um instante → "YYYY-MM-DD". */
export function dataCivilSP(d: Date | string): string | null {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return fmtSP.format(dt);
}

function partesUTC(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

/** Data só-data gravada (validade/emissão): "YYYY-MM-DD" literal ou meia-noite UTC → dia UTC; com hora → dia civil SP. */
export function dataCivilDeData(v: Date | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (RE_DATA.test(s)) return s;
  }
  const dt = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(dt.getTime())) return null;
  const meiaNoiteUTC =
    dt.getUTCHours() === 0 && dt.getUTCMinutes() === 0 && dt.getUTCSeconds() === 0 && dt.getUTCMilliseconds() === 0;
  return meiaNoiteUTC ? partesUTC(dt) : dataCivilSP(dt);
}

/** Instante de execução / "hoje": "YYYY-MM-DD" literal vale como dia; senão dia civil em SP. */
export function dataCivilDeInstante(v: Date | string | null | undefined): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string" && RE_DATA.test(v.trim())) return v.trim();
  return dataCivilSP(v instanceof Date ? v : new Date(v));
}

/** Diferença em dias civis b − a (ambos "YYYY-MM-DD"). */
export function diasCivisEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}
