import { describe, expect, it } from 'vitest';
import {
  canClaimWithholdingExemption,
  compareIrsRegimes,
  estimateIrs,
  irsPaymentsOnAccount,
  progressiveTax,
  simplifiedCoefficient,
  solidaritySurcharge,
  taxCredits,
  withholdingFor,
} from '../src';
import { c, params2025 as P, params2026 as P26 } from './helpers';

describe('taxas gerais (art. 68.º CIRS, escalões de 2025)', () => {
  it('1.º escalão completo: 8 059 × 12,5% = 1 007,375 → 1 007,38 €', () => {
    expect(progressiveTax(c(8059), P).taxCents).toBe(c(1007.38));
  });

  it('24 300 €: 1 007,375 + 656,16 + 1 090,695 + 1 237,812 + 626,116 = 4 618,16 €', () => {
    // 8 059×12,5% + 4 101×16% + 5 073×21,5% + 5 073×24,4% + 1 994×31,4%
    const r = progressiveTax(c(24300), P);
    expect(r.taxCents).toBe(c(4618.16));
    expect(r.marginalRate).toBe(0.314);
    expect(r.parts).toHaveLength(5);
  });

  it('usa os escalões do ano: 24 300 € em 2026 (proposta OE2026)', () => {
    // 8 342×12,5% + 4 245×15,7% + 5 251×21,2% + 5 251×24,1% + 1 211×31,1%
    // = 1 042,75 + 666,465 + 1 113,212 + 1 265,491 + 376,621 = 4 464,539 → 4 464,54 €
    expect(progressiveTax(c(24300), P26).taxCents).toBe(c(4464.54));
  });

  it('taxa adicional de solidariedade: (100 000 − 80 000) × 2,5% = 500 €', () => {
    expect(solidaritySurcharge(c(100_000), P)).toBe(c(500));
    // (250 000 − 80 000) × 2,5% + (300 000 − 250 000) × 5% = 4 250 + 2 500
    expect(solidaritySurcharge(c(300_000), P)).toBe(c(6750));
    expect(solidaritySurcharge(c(80_000), P)).toBe(0);
  });
});

describe('regime simplificado (art. 31.º CIRS)', () => {
  const base = { year: 2025, regime: 'irs_simplificado' as const, activityStartDate: '2020-01-01' };

  it('coeficientes e redução de início de atividade (50% no 1.º ano, 25% no 2.º)', () => {
    expect(simplifiedCoefficient('servicos_tabela_151', { year: 2025, activityStartDate: '2020-01-01' }, P).effective).toBe(0.75);
    expect(simplifiedCoefficient('servicos_tabela_151', { year: 2025, activityStartDate: '2025-03-01' }, P).effective).toBe(0.375);
    expect(simplifiedCoefficient('servicos_tabela_151', { year: 2025, activityStartDate: '2024-03-01' }, P).effective).toBeCloseTo(0.5625);
    expect(simplifiedCoefficient('servicos_outros', { year: 2025, activityStartDate: '2025-03-01' }, P).effective).toBe(0.175);
    expect(simplifiedCoefficient('vendas', { year: 2025, activityStartDate: '2025-03-01' }, P).effective).toBe(0.15);
    // Sem redução se houver rendimentos da categoria A
    expect(simplifiedCoefficient('servicos_tabela_151', { year: 2025, activityStartDate: '2025-03-01', hasEmploymentIncome: true }, P).effective).toBe(0.75);
  });

  it('acresce a falta de justificação dos 15%: 40 000 € → 30 000 + 1 037,85 = 31 037,85 € coletável', () => {
    // exigido 15% × 40 000 = 6 000; justificado max(4 462,15; 3 000) + 500 = 4 962,15; acréscimo 1 037,85
    const r = estimateIrs(
      {
        ...base,
        incomes: [{ type: 'servicos_tabela_151', grossCents: c(40_000) }],
        socialSecurityPaidCents: c(3000),
        justifiedExpenses: { efaturaCents: c(500) },
      },
      P,
    );
    expect(r.catB.justification).toEqual({ requiredCents: c(6000), justifiedCents: c(4962.15), additionCents: c(1037.85) });
    expect(r.collectableCents).toBe(c(31_037.85));
    // 5 905,558 (até 28 400) + 2 637,85 × 34,9% (920,60965) = 6 826,16765 → 6 826,17
    expect(r.progressiveTaxCents).toBe(c(6826.17));
    expect(r.resultCents).toBe(c(6826.17));
  });

  it('vendas (coef. 0,15) não estão sujeitas à justificação dos 15%', () => {
    const r = estimateIrs({ ...base, incomes: [{ type: 'vendas', grossCents: c(100_000) }] }, P);
    expect(r.catB.justification).toBeUndefined();
    expect(r.collectableCents).toBe(c(15_000));
  });

  it('1.º ano de atividade com 20 000 €: coletável 7 500 €, imposto anulado pelo mínimo de existência', () => {
    const r = estimateIrs(
      { ...base, activityStartDate: '2025-02-01', incomes: [{ type: 'servicos_tabela_151', grossCents: c(20_000) }], withholdingCents: c(4600) },
      P,
    );
    expect(r.collectableCents).toBe(c(7500));
    expect(r.progressiveTaxCents).toBe(c(937.5)); // 7 500 × 12,5%
    expect(r.minimoExistenciaReliefCents).toBe(c(937.5));
    expect(r.netTaxCents).toBe(0);
    expect(r.resultCents).toBe(c(-4600)); // reembolso de toda a retenção
  });

  it('deduções à coleta com limites', () => {
    // gerais 35% × 1 000 = 350 → limite 250; saúde 15% × 2 000 = 300; educação 30% × 1 000 = 300; 1 dependente 600
    const t = taxCredits({ generalFamilyExpensesCents: c(1000), healthExpensesCents: c(2000), educationExpensesCents: c(1000), dependents: 1 }, P);
    expect(t).toEqual({ general: c(250), health: c(300), education: c(300), dependents: c(600), total: c(1450) });
  });
});

describe('contabilidade organizada e simulador de regime', () => {
  it('lucro 50 000 − 30 000 = 20 000 €: imposto 3 429,38 €', () => {
    // 3 992,042 (até 17 233... ) → 1 007,375 + 656,16 + 1 090,695 + 2 767 × 24,4% (675,148) = 3 429,378
    const r = estimateIrs(
      { year: 2025, regime: 'irs_contabilidade_organizada', activityStartDate: '2020-01-01', incomes: [{ type: 'servicos_tabela_151', grossCents: c(50_000) }], deductibleExpensesCents: c(30_000) },
      P,
    );
    expect(r.collectableCents).toBe(c(20_000));
    expect(r.netTaxCents).toBe(c(3429.38));
  });

  it('com despesas elevadas, a contabilidade organizada compensa: poupança de 6 314,42 €', () => {
    // Simplificado: 60 000 × 0,75 = 45 000 → 11 975,575 → 11 975,58 €
    // Organizada: 60 000 − 35 000 − 1 200 = 23 800 → 3 992,042 + 1 494 × 31,4% = 4 461,158 → 4 461,16 €
    // Poupança: 11 975,58 − 4 461,16 − 1 200 = 6 314,42 €
    const cmp = compareIrsRegimes(
      { year: 2025, activityStartDate: '2020-01-01', incomes: [{ type: 'servicos_tabela_151', grossCents: c(60_000) }], justifiedExpenses: { efaturaCents: c(35_000) } },
      { deductibleExpensesCents: c(35_000), accountantCostCents: c(1200) },
      P,
    );
    expect(cmp.simplified.netTaxCents).toBe(c(11_975.58));
    expect(cmp.organized.netTaxCents).toBe(c(4461.16));
    expect(cmp.savingsWithOrganizedCents).toBe(c(6314.42));
    expect(cmp.recommendation).toBe('irs_contabilidade_organizada');
  });

  it('acima de 200 000 € o simplificado não é permitido', () => {
    const cmp = compareIrsRegimes(
      { year: 2025, activityStartDate: '2020-01-01', incomes: [{ type: 'vendas', grossCents: c(250_000) }] },
      { deductibleExpensesCents: c(240_000), accountantCostCents: c(2000) },
      P,
    );
    expect(cmp.simplifiedAllowed).toBe(false);
    expect(cmp.simplified.warnings[0]).toMatch(/art. 28/);
  });
});

describe('retenção na fonte e pagamentos por conta', () => {
  it('23% para atividades do art. 151.º quando o cliente tem contabilidade organizada', () => {
    expect(withholdingFor({ netCents: c(1000), incomeType: 'servicos_tabela_151', clientHasOrganizedAccounting: true, providerExempt: false }, P).withholdingCents).toBe(c(230));
    expect(withholdingFor({ netCents: c(1000), incomeType: 'servicos_outros', clientHasOrganizedAccounting: true, providerExempt: false }, P).withholdingCents).toBe(c(115));
    expect(withholdingFor({ netCents: c(1000), incomeType: 'servicos_tabela_151', clientHasOrganizedAccounting: false, providerExempt: false }, P).withholdingCents).toBe(0);
    expect(withholdingFor({ netCents: c(1000), incomeType: 'servicos_tabela_151', clientHasOrganizedAccounting: true, providerExempt: true }, P).withholdingCents).toBe(0);
    expect(canClaimWithholdingExemption(c(15_000), P)).toBe(true);
    expect(canClaimWithholdingExemption(c(15_000.01), P)).toBe(false);
  });

  it('pagamentos por conta: (3 000 × 100% − 1 000) × 76,5% = 1 530 € em 3 prestações', () => {
    const r = irsPaymentsOnAccount({ baseYearNetTaxCents: c(3000), baseYearCatBShare: 1, baseYearCatBWithholdingCents: c(1000) }, P);
    expect(r.totalCents).toBe(c(1530));
    expect(r.installmentCents).toEqual([c(510), c(510), c(510)]);
    expect(irsPaymentsOnAccount({ baseYearNetTaxCents: c(1200), baseYearCatBShare: 1, baseYearCatBWithholdingCents: c(1000) }, P).totalCents).toBe(0);
  });
});
