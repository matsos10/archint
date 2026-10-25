/**
 * Verificação de números em texto gerado: todos os montantes em euros mencionados têm de existir nos
 * dados fornecidos pelo motor fiscal. Impede que a IA "invente" valores numa explicação.
 */
const EUR_RE = /(-?\d{1,3}(?:[ . ]\d{3})*(?:,\d{1,2})?|-?\d+(?:,\d{1,2})?)\s?(?:€|euros?\b)/gi;

export function euroAmountsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(EUR_RE)) {
    const n = Number(m[1]!.replace(/[ . ]/g, '').replace(',', '.'));
    if (Number.isFinite(n)) out.push(Math.round(Math.abs(n) * 100));
  }
  return out;
}

/** Devolve os montantes do texto que não constam da lista permitida (tolerância de 1 € para arredondamentos "cerca de"). */
export function unknownAmounts(text: string, allowedCents: number[]): number[] {
  const allowed = allowedCents.map((c) => Math.abs(c));
  return euroAmountsIn(text).filter((v) => !allowed.some((a) => Math.abs(a - v) <= 100 || Math.abs(Math.round(a / 100) * 100 - v) <= 100));
}

export const formatEuroPt = (cents: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
