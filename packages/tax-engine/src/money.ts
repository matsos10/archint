/**
 * Aritmética monetária em cêntimos (inteiros). Os cálculos intermédios podem ter frações de cêntimo;
 * arredonda-se apenas no fim, ao cêntimo, "metade para cima" (afastando de zero), como nos impressos da AT.
 */
export function roundCents(x: number): number {
  const clean = Math.round(x * 1e6) / 1e6; // remove ruído de vírgula flutuante
  const sign = clean < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(clean));
}

/** Aplica uma taxa (0–1) a um montante em cêntimos, com arredondamento ao cêntimo. */
export function applyRate(cents: number, rate: number): number {
  return roundCents(cents * rate);
}

/** IVA contido num valor com IVA incluído: bruto × t / (100 + t). Taxa em percentagem. */
export function vatFromGross(grossCents: number, ratePct: number): number {
  return roundCents((grossCents * ratePct) / (100 + ratePct));
}

/** IVA sobre a base tributável. Taxa em percentagem. */
export function vatFromNet(netCents: number, ratePct: number): number {
  return roundCents((netCents * ratePct) / 100);
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export const eur = (cents: number) => (cents / 100).toFixed(2);

export const clamp = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max);
