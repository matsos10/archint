import { describe, expect, it } from 'vitest';
import { computeSocialSecurity } from '../src';
import { c, resolve } from './helpers';

const base = { legalForm: 'trabalhador_independente' as const, activityStartDate: '2020-01-01' };

describe('Segurança Social dos trabalhadores independentes', () => {
  it('4 800 € no 1.º trimestre → base 1 120 € → 239,68 €/mês em abril, maio e junho', () => {
    // relevante 70% × 4 800 = 3 360; base 3 360 / 3 = 1 120; 21,4% × 1 120 = 239,68
    const r = computeSocialSecurity({ ...base, quarters: [{ year: 2025, quarter: 1, byType: { servicos_tabela_151: c(4800) } }] }, resolve);
    const q = r.quarters[0]!;
    expect(q.relevantIncomeCents).toBe(c(3360));
    expect(q.monthlyBaseCents).toBe(c(1120));
    expect(q.monthlyContributionCents).toBe(c(239.68));
    expect(q.declarationDueDate).toBe('2025-04-30');
    expect(q.months.map((m) => [m.month, m.dueDate])).toEqual([
      ['2025-04', '2025-05-20'],
      ['2025-05', '2025-06-20'],
      ['2025-06', '2025-07-21'], // 20/07/2025 é domingo
    ]);
    expect(r.byYear[2025]).toBe(c(719.04));
  });

  it('vendas contam 20%: 10 000 € → relevante 2 000 € → base 666,67 € → 142,67 €', () => {
    const r = computeSocialSecurity({ ...base, quarters: [{ year: 2025, quarter: 2, byType: { vendas: c(10_000) } }] }, resolve);
    expect(r.quarters[0]!.monthlyBaseCents).toBe(c(666.67));
    expect(r.quarters[0]!.monthlyContributionCents).toBe(c(142.67)); // 666,67 × 21,4% = 142,667
  });

  it('limita a base a 12 × IAS (6 270 € em 2025) e aplica a contribuição mínima de 20 €', () => {
    const big = computeSocialSecurity({ ...base, quarters: [{ year: 2025, quarter: 1, byType: { servicos_outros: c(100_000) } }] }, resolve);
    expect(big.quarters[0]!.monthlyBaseCents).toBe(c(6270));
    expect(big.quarters[0]!.monthlyContributionCents).toBe(c(1341.78)); // 6 270 × 21,4%
    const small = computeSocialSecurity({ ...base, quarters: [{ year: 2025, quarter: 1, byType: { servicos_outros: c(150) } }] }, resolve);
    expect(small.quarters[0]!.monthlyContributionCents).toBe(c(20));
    const zero = computeSocialSecurity({ ...base, quarters: [{ year: 2025, quarter: 1, byType: {} }] }, resolve);
    expect(zero.quarters[0]!.monthlyContributionCents).toBe(0);
  });

  it('isenta nos primeiros 12 meses de atividade', () => {
    const r = computeSocialSecurity(
      { ...base, activityStartDate: '2025-02-10', quarters: [{ year: 2025, quarter: 1, byType: { servicos_tabela_151: c(3000) } }, { year: 2025, quarter: 4, byType: { servicos_tabela_151: c(3000) } }] },
      resolve,
    );
    expect(r.quarters[0]!.months.every((m) => m.contributionCents === 0 && m.exemptReason)).toBe(true);
    // Enquadramento a partir do 1.º dia do 12.º mês posterior ao início (fevereiro de 2026):
    // 4.º trimestre → janeiro (isento), fevereiro e março de 2026 pagam 3 000 × 70% / 3 × 21,4% = 149,80 €
    expect(r.quarters[1]!.months.map((m) => m.contributionCents)).toEqual([0, c(149.8), c(149.8)]);
  });

  it('isenta em acumulação com trabalho por conta de outrem (rendimento relevante < 4 × IAS)', () => {
    const r = computeSocialSecurity(
      { ...base, employmentMonthlyGrossCents: c(1200), quarters: [{ year: 2025, quarter: 1, byType: { servicos_tabela_151: c(6000) } }] },
      resolve,
    );
    expect(r.quarters[0]!.months[0]!.exemptReason).toMatch(/acumulação/);
  });

  it('aplica 25,2% a ENI com cônjuge e o ajuste voluntário da base', () => {
    const eni = computeSocialSecurity(
      { legalForm: 'eni', eniWithSpouse: true, activityStartDate: '2020-01-01', quarters: [{ year: 2025, quarter: 1, byType: { servicos_tabela_151: c(4800) } }] },
      resolve,
    );
    expect(eni.quarters[0]!.monthlyContributionCents).toBe(c(282.24)); // 1 120 × 25,2%
    const adj = computeSocialSecurity({ ...base, baseAdjustmentPct: -25, quarters: [{ year: 2025, quarter: 1, byType: { servicos_tabela_151: c(4800) } }] }, resolve);
    expect(adj.quarters[0]!.monthlyBaseCents).toBe(c(840));
    expect(() => computeSocialSecurity({ ...base, baseAdjustmentPct: -30, quarters: [{ year: 2025, quarter: 1, byType: {} }] }, resolve)).toThrow();
  });
});
