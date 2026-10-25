/** Datas ISO (AAAA-MM-DD) tratadas em UTC, sem horas, para evitar problemas de fuso horário. */
export type IsoDate = string;

export function parseIso(d: IsoDate): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Data inválida: ${d}`);
  return new Date(d + 'T00:00:00Z');
}

export function toIso(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function makeDate(year: number, month: number, day: number): IsoDate {
  return toIso(new Date(Date.UTC(year, month - 1, day)));
}

export function lastDayOfMonth(year: number, month: number): IsoDate {
  return toIso(new Date(Date.UTC(year, month, 0)));
}

export function addDays(d: IsoDate, n: number): IsoDate {
  const x = parseIso(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toIso(x);
}

/** Soma meses a (ano, mês) e devolve [ano, mês]. */
export function addMonths(year: number, month: number, n: number): [number, number] {
  const idx = year * 12 + (month - 1) + n;
  return [Math.floor(idx / 12), (idx % 12) + 1];
}

export function ym(d: IsoDate): [number, number] {
  return [Number(d.slice(0, 4)), Number(d.slice(5, 7))];
}

export const quarterOf = (month: number) => Math.ceil(month / 3);

export function quarterRange(year: number, q: number): { start: IsoDate; end: IsoDate } {
  const m = (q - 1) * 3 + 1;
  return { start: makeDate(year, m, 1), end: lastDayOfMonth(year, m + 2) };
}

export function monthRange(year: number, month: number): { start: IsoDate; end: IsoDate } {
  return { start: makeDate(year, month, 1), end: lastDayOfMonth(year, month) };
}

/** Dia (1–31) num mês, limitado ao último dia do mês ("last" = último dia). */
export function dayInMonth(year: number, month: number, day: number | 'last'): IsoDate {
  const last = Number(lastDayOfMonth(year, month).slice(8));
  return makeDate(year, month, day === 'last' ? last : Math.min(day, last));
}

/** Meses completos entre duas datas (para contagem de isenções a partir do início de atividade). */
export function monthIndex(d: IsoDate): number {
  const [y, m] = ym(d);
  return y * 12 + (m - 1);
}

export const compareIso = (a: IsoDate, b: IsoDate) => (a < b ? -1 : a > b ? 1 : 0);
