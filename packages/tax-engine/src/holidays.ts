import { addDays, makeDate, parseIso, type IsoDate } from './dates';

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeDate(year, month, day);
}

/**
 * Feriados nacionais obrigatórios (art. 234.º do Código do Trabalho, redação da Lei n.º 8/2016).
 * Não inclui feriados municipais nem o Carnaval (facultativo).
 */
export function nationalHolidays(year: number): Map<IsoDate, string> {
  const easter = easterSunday(year);
  const list: [IsoDate, string][] = [
    [makeDate(year, 1, 1), 'Ano Novo'],
    [addDays(easter, -2), 'Sexta-feira Santa'],
    [easter, 'Páscoa'],
    [makeDate(year, 4, 25), 'Dia da Liberdade'],
    [makeDate(year, 5, 1), 'Dia do Trabalhador'],
    [addDays(easter, 60), 'Corpo de Deus'],
    [makeDate(year, 6, 10), 'Dia de Portugal'],
    [makeDate(year, 8, 15), 'Assunção de Nossa Senhora'],
    [makeDate(year, 10, 5), 'Implantação da República'],
    [makeDate(year, 11, 1), 'Dia de Todos os Santos'],
    [makeDate(year, 12, 1), 'Restauração da Independência'],
    [makeDate(year, 12, 8), 'Imaculada Conceição'],
    [makeDate(year, 12, 25), 'Natal'],
  ];
  return new Map(list);
}

const cache = new Map<number, Map<IsoDate, string>>();
export function isHoliday(d: IsoDate): boolean {
  const y = Number(d.slice(0, 4));
  if (!cache.has(y)) cache.set(y, nationalHolidays(y));
  return cache.get(y)!.has(d);
}

export function isBusinessDay(d: IsoDate): boolean {
  const wd = parseIso(d).getUTCDay();
  return wd !== 0 && wd !== 6 && !isHoliday(d);
}

/**
 * Prazo que termine em sábado, domingo ou feriado transfere-se para o primeiro dia útil seguinte
 * (art. 20.º, n.º 1 CPPT e art. 279.º, al. e) do Código Civil).
 */
export function adjustDeadline(d: IsoDate): IsoDate {
  let x = d;
  while (!isBusinessDay(x)) x = addDays(x, 1);
  return x;
}

/** Último dia útil do mês (ex.: Modelo 22 "até ao último dia do mês de maio"). */
export function lastBusinessDayOnOrBefore(d: IsoDate): IsoDate {
  let x = d;
  while (!isBusinessDay(x)) x = addDays(x, -1);
  return x;
}
