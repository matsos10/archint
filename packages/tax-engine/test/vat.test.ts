import { describe, expect, it } from 'vitest';
import {
  assessArt53,
  checkDocumentVat,
  computeVatPeriod,
  computeVatYear,
  inferRateCode,
  requiredVatPeriodicity,
  vatDueDates,
  vatFromGross,
  vatPeriodsForYear,
  vatRatePct,
  type VatOperation,
} from '../src';
import { c, params2025 as P } from './helpers';

describe('taxas e validação de documentos', () => {
  it('usa as taxas por região (art. 18.º CIVA)', () => {
    expect(vatRatePct('normal', 'continente', P)).toBe(23);
    expect(vatRatePct('intermedia', 'continente', P)).toBe(13);
    expect(vatRatePct('reduzida', 'continente', P)).toBe(6);
    expect(vatRatePct('normal', 'acores', P)).toBe(16);
    expect(vatRatePct('normal', 'madeira', P)).toBe(22);
    expect(vatRatePct('isenta', 'continente', P)).toBe(0);
  });

  it('extrai o IVA de um valor com IVA incluído: 61,50 € a 23% → 11,50 €', () => {
    expect(vatFromGross(c(61.5), 23)).toBe(c(11.5));
    expect(vatFromGross(c(33.9), 13)).toBe(c(3.9));
  });

  it('valida base/IVA com tolerância de 1 cêntimo e infere a taxa', () => {
    // 33,33 × 23% = 7,6659 → 7,67 €
    expect(checkDocumentVat({ netCents: 3333, vatCents: 766, rateCode: 'normal', region: 'continente' }, P).ok).toBe(true);
    const bad = checkDocumentVat({ netCents: 3333, vatCents: 800, rateCode: 'normal', region: 'continente' }, P);
    expect(bad.ok).toBe(false);
    expect(bad.expectedVatCents).toBe(767);
    expect(inferRateCode(c(30), c(3.9), 'continente', P)).toBe('intermedia');
    expect(inferRateCode(c(30), c(5), 'continente', P)).toBeNull();
  });
});

describe('periodicidade, isenção e prazos', () => {
  it('trimestral abaixo de 650 000 € de volume de negócios, mensal a partir daí', () => {
    expect(requiredVatPeriodicity(c(649_999.99), P)).toBe('normal_trimestral');
    expect(requiredVatPeriodicity(c(650_000), P)).toBe('normal_mensal');
    expect(vatPeriodsForYear('normal_trimestral', 2025)).toHaveLength(4);
    expect(vatPeriodsForYear('normal_mensal', 2025)).toHaveLength(12);
    expect(vatPeriodsForYear('isento_art53', 2025)).toHaveLength(0);
  });

  it('prazos: dia 20 (declaração) e 25 (pagamento) do 2.º mês seguinte, ajustados a dia útil', () => {
    expect(vatDueDates('2025-03-31', P)).toEqual({ declaration: '2025-05-20', payment: '2025-05-26' });
    expect(vatDueDates('2025-01-31', P)).toEqual({ declaration: '2025-03-20', payment: '2025-03-25' });
    expect(vatDueDates('2025-12-31', P)).toEqual({ declaration: '2026-02-20', payment: '2026-02-25' });
  });

  it('avalia o regime do art. 53.º', () => {
    const base = { previousYearTurnoverCents: c(14_000), currentYearTurnoverCents: c(16_000), hasOrganizedAccounting: false };
    const a = assessArt53(base, P);
    expect(a).toMatchObject({ eligible: true, exitNextYear: true, exitImmediately: false });
    expect(assessArt53({ ...base, currentYearTurnoverCents: c(19_000) }, P).exitImmediately).toBe(true);
    expect(assessArt53({ ...base, hasOrganizedAccounting: true }, P).eligible).toBe(false);
    expect(assessArt53({ ...base, previousYearTurnoverCents: c(15_000.01) }, P).eligible).toBe(false);
  });
});

describe('apuramento do período (cálculo à mão)', () => {
  const ops: VatOperation[] = [
    { date: '2025-01-15', kind: 'output', netCents: c(1000), vatCents: c(230), rateCode: 'normal' },
    { date: '2025-02-10', kind: 'output', netCents: c(500), vatCents: c(30), rateCode: 'reduzida' },
    { date: '2025-03-01', kind: 'output', netCents: c(-100), vatCents: c(-23), rateCode: 'normal' }, // nota de crédito
    { date: '2025-01-20', kind: 'input', netCents: c(200), vatCents: c(46), rateCode: 'normal' },
    { date: '2025-02-02', kind: 'input', netCents: c(100), vatCents: c(23), rateCode: 'normal', deductiblePct: 50 }, // gasóleo
    { date: '2025-02-03', kind: 'input', netCents: c(100), vatCents: c(13), rateCode: 'intermedia', deductiblePct: 0 }, // refeição
    { date: '2025-02-04', kind: 'input', netCents: c(1000), vatCents: c(230), rateCode: 'normal', bucket: 'imobilizado' },
    { ref: 'sem-fatura', date: '2025-02-05', kind: 'input', netCents: c(40), vatCents: c(9.2), rateCode: 'normal', hasValidInvoice: false },
    { date: '2025-03-10', kind: 'input', netCents: c(300), vatCents: c(69), rateCode: 'normal', bucket: 'existencias' },
    { date: '2025-03-11', kind: 'input', netCents: c(86.96), vatCents: c(20), rateCode: 'normal', businessPct: 50 }, // uso misto
    { date: '2025-04-01', kind: 'output', netCents: c(5000), vatCents: c(1150), rateCode: 'normal' }, // fora do período
  ];

  it('liquidado 237,00 − dedutível 366,50 − reporte 50,00 = crédito de 179,50 €', () => {
    const r = computeVatPeriod(
      { regime: 'normal_trimestral', period: { start: '2025-01-01', end: '2025-03-31' }, operations: ops, carryForwardCents: c(50) },
      P,
    );
    expect(r.output.totalVatCents).toBe(c(237));
    // 46 + 11,50 + 0 + 230 + 69 + 10 = 366,50
    expect(r.input.deductibleCents).toBe(c(366.5));
    expect(r.input.excludedWithoutInvoice).toEqual(['sem-fatura']);
    expect(r.balanceCents).toBe(c(-179.5));
    expect(r.payableCents).toBe(0);
    expect(r.creditCents).toBe(c(179.5));
    expect(r.fields).toMatchObject({
      '1': c(500), '2': c(30), '3': c(900), '4': c(207),
      '20': c(230), '22': c(69), '24': c(67.5), '61': c(50), '93': 0, '96': c(179.5),
    });
    expect(r.dueDates).toEqual({ declaration: '2025-05-20', payment: '2025-05-26' });
    expect(r.warnings[0]).toMatch(/sem fatura/);
  });

  it('propaga o crédito para o período seguinte', () => {
    const year = computeVatYear({ regime: 'normal_trimestral', year: 2025, operations: ops, openingCreditCents: c(50) }, P);
    expect(year[0]!.creditCents).toBe(c(179.5));
    // T2: 1150,00 − 179,50 = 970,50
    expect(year[1]!.payableCents).toBe(c(970.5));
    expect(year[2]!.carryForwardInCents).toBe(0);
  });

  it('no regime de isenção não há IVA a entregar nem a deduzir', () => {
    const r = computeVatPeriod({ regime: 'isento_art53', period: { start: '2025-01-01', end: '2025-03-31' }, operations: ops }, P);
    expect(r.applicable).toBe(false);
    expect(r.payableCents).toBe(0);
    expect(r.output.exemptBaseCents).toBe(c(1400));
  });
});
