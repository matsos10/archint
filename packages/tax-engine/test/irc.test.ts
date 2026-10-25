import { describe, expect, it } from 'vitest';
import { estimateIrc } from '../src';
import { c, params2025 as P } from './helpers';

describe('IRC (estimativa)', () => {
  it('PME com 100 000 € de lucro: 50 000 × 16% + 50 000 × 20% + derrama 1,5% = 19 500 €', () => {
    const r = estimateIrc({ taxableProfitCents: c(100_000), isSme: true }, P);
    expect(r.ircCents).toBe(c(18_000));
    expect(r.municipalSurchargeCents).toBe(c(1500));
    expect(r.totalCents).toBe(c(19_500));
  });

  it('derrama estadual acima de 1,5 M€: (2 000 000 − 1 500 000) × 3% = 15 000 €', () => {
    const r = estimateIrc({ taxableProfitCents: c(2_000_000), isSme: false, municipalSurchargeRate: 0 }, P);
    expect(r.ircCents).toBe(c(400_000));
    expect(r.stateSurchargeCents).toBe(c(15_000));
  });
});
