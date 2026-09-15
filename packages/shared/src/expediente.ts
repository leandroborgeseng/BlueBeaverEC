/** Expediente padrão da engenharia clínica: seg–sex 8h–17h (não conta noite nem fim de semana). */
export type CalendarioExpediente = {
  timeZone: string;
  inicioMinutos: number;
  fimMinutos: number;
  /** 0 = domingo … 6 = sábado (igual `Date#getDay`). */
  dias: number[];
};

export const EXPEDIENTE_PADRAO: CalendarioExpediente = {
  timeZone: "America/Sao_Paulo",
  inicioMinutos: 8 * 60,
  fimMinutos: 17 * 60,
  dias: [1, 2, 3, 4, 5],
};

export function calendarioExpediente(timeZone?: string | null): CalendarioExpediente {
  const tz = timeZone?.trim();
  return { ...EXPEDIENTE_PADRAO, timeZone: tz || EXPEDIENTE_PADRAO.timeZone };
}

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

type Zoned = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dow: number;
};

function zoned(date: Date, timeZone: string): Zoned {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    dow: WEEKDAY[get("weekday")] ?? 0,
  };
}

function fromZoned(
  z: Pick<Zoned, "year" | "month" | "day" | "hour" | "minute" | "second">,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute, z.second);
  const asTz = zoned(new Date(utcGuess), timeZone);
  const asTzUtc = Date.UTC(asTz.year, asTz.month - 1, asTz.day, asTz.hour, asTz.minute, asTz.second);
  return new Date(utcGuess - (asTzUtc - utcGuess));
}

function atLocal(z: Zoned, minutos: number, cal: CalendarioExpediente): Date {
  return fromZoned(
    {
      year: z.year,
      month: z.month,
      day: z.day,
      hour: Math.floor(minutos / 60),
      minute: minutos % 60,
      second: 0,
    },
    cal.timeZone,
  );
}

function ehDiaUtil(dow: number, cal: CalendarioExpediente): boolean {
  return cal.dias.includes(dow);
}

/** Move o instante para o próximo minuto de expediente (ou o próprio, se já estiver dentro). */
export function snapParaExpediente(from: Date, cal: CalendarioExpediente = EXPEDIENTE_PADRAO): Date {
  let cursor = from;
  for (let i = 0; i < 16; i++) {
    const z = zoned(cursor, cal.timeZone);
    if (ehDiaUtil(z.dow, cal)) {
      const start = atLocal(z, cal.inicioMinutos, cal);
      const end = atLocal(z, cal.fimMinutos, cal);
      if (cursor.getTime() < start.getTime()) return start;
      if (cursor.getTime() < end.getTime()) return cursor;
    }
    const noon = atLocal(z, 12 * 60, cal);
    const next = zoned(new Date(noon.getTime() + 24 * 60 * 60 * 1000), cal.timeZone);
    cursor = atLocal(next, cal.inicioMinutos, cal);
  }
  return cursor;
}

/** Soma horas de expediente (não conta noite nem sábado/domingo). */
export function addHorasUteis(
  inicio: Date,
  horas: number,
  cal: CalendarioExpediente = EXPEDIENTE_PADRAO,
): Date {
  if (!(horas > 0)) return new Date(inicio);
  let remaining = Math.round(horas * 60);
  let cursor = snapParaExpediente(inicio, cal);
  let guard = 0;
  while (remaining > 0 && guard++ < 20_000) {
    const z = zoned(cursor, cal.timeZone);
    const end = atLocal(z, cal.fimMinutos, cal);
    const left = Math.max(0, Math.round((end.getTime() - cursor.getTime()) / 60_000));
    if (left <= 0) {
      cursor = snapParaExpediente(new Date(end.getTime() + 60_000), cal);
      continue;
    }
    const take = Math.min(remaining, left);
    cursor = new Date(cursor.getTime() + take * 60_000);
    remaining -= take;
    if (remaining > 0) {
      cursor = snapParaExpediente(new Date(cursor.getTime() + 60_000), cal);
    }
  }
  return cursor;
}

/** Minutos de expediente entre dois instantes. Negativo se `to` é anterior a `from`. */
export function minutosUteisEntre(
  from: Date | string | number,
  to: Date | string | number,
  cal: CalendarioExpediente = EXPEDIENTE_PADRAO,
): number {
  const a = new Date(from);
  const b = new Date(to);
  if (a.getTime() === b.getTime()) return 0;
  if (a.getTime() > b.getTime()) return -minutosUteisEntre(b, a, cal);

  let total = 0;
  let cursor = snapParaExpediente(a, cal);
  let guard = 0;
  while (cursor.getTime() < b.getTime() && guard++ < 20_000) {
    const z = zoned(cursor, cal.timeZone);
    const end = atLocal(z, cal.fimMinutos, cal);
    const cap = b.getTime() < end.getTime() ? b : end;
    if (cap.getTime() > cursor.getTime()) {
      total += Math.round((cap.getTime() - cursor.getTime()) / 60_000);
    }
    if (b.getTime() <= end.getTime()) break;
    cursor = snapParaExpediente(new Date(end.getTime() + 60_000), cal);
  }
  return total;
}
