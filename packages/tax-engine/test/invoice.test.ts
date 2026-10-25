import { describe, expect, it } from 'vitest';
import { buildAtcud, computeInvoice, validateInvoice, type InvoiceContext } from '../src';
import { c, params2025 as P } from './helpers';

const ctx: InvoiceContext = {
  region: 'continente',
  vatRegime: 'normal_trimestral',
  incomeType: 'servicos_tabela_151',
  providerIsIndividual: true,
  providerWithholdingExempt: false,
  clientHasOrganizedAccounting: true,
};

describe('cálculo de faturas', () => {
  it('fatura do caso de referência: 3 000 € + IVA 23% − retenção 23% = 3 000 €', () => {
    const t = computeInvoice([{ description: 'Identidade visual', quantity: 1, unitPriceCents: c(3000), vatRateCode: 'normal' }], ctx, P);
    expect(t).toMatchObject({ netCents: c(3000), vatCents: c(690), withholdingCents: c(690), totalCents: c(3000), withholdingRate: 0.23 });
  });

  it('várias taxas, quantidades e desconto, IVA por taxa', () => {
    // 3 × 33,33 = 99,99; 2 × 10,00 com 10% = 18,00; 1 × 50,00 a 6%
    const t = computeInvoice(
      [
        { description: 'A', quantity: 3, unitPriceCents: c(33.33), vatRateCode: 'normal' },
        { description: 'B', quantity: 2, unitPriceCents: c(10), discountPct: 10, vatRateCode: 'normal' },
        { description: 'C', quantity: 1, unitPriceCents: c(50), vatRateCode: 'reduzida' },
      ],
      { ...ctx, clientHasOrganizedAccounting: false },
      P,
    );
    // normal: (99,99 + 18,00) × 23% = 27,1377 → 27,14; reduzida: 50 × 6% = 3,00
    expect(t.byRate).toEqual([
      { rateCode: 'normal', ratePct: 23, baseCents: c(117.99), vatCents: c(27.14), exemptionCode: null },
      { rateCode: 'reduzida', ratePct: 6, baseCents: c(50), vatCents: c(3), exemptionCode: null },
    ]);
    expect(t.lines.map((l) => l.vatCents)).toEqual([c(23), c(4.14), c(3)]);
    expect(t).toMatchObject({ netCents: c(167.99), vatCents: c(30.14), withholdingCents: 0, totalCents: c(198.13) });
  });

  it('regime de isenção do art. 53.º: sem IVA e motivo M10', () => {
    const t = computeInvoice([{ description: 'Serviço', quantity: 1, unitPriceCents: c(500), vatRateCode: 'normal' }], { ...ctx, vatRegime: 'isento_art53', providerWithholdingExempt: true }, P);
    expect(t.vatCents).toBe(0);
    expect(t.lines[0]!.vatExemptionCode).toBe('M10');
    expect(t.totalCents).toBe(c(500));
  });

  it('sociedades não têm retenção de IRS', () => {
    const t = computeInvoice([{ description: 'Serviço', quantity: 1, unitPriceCents: c(1000), vatRateCode: 'normal' }], { ...ctx, providerIsIndividual: false }, P);
    expect(t.withholdingCents).toBe(0);
  });
});

describe('validação de faturas (art. 36.º CIVA)', () => {
  const base = {
    docType: 'FT' as const,
    issueDate: '2025-03-10',
    today: '2025-03-10',
    issuer: { name: 'Marta', nif: '234567899', addressLine: 'Rua', postalCode: '4050-262', city: 'Porto' },
    client: { name: 'Cliente, Lda.', nif: '509123457', isCompany: true },
  };
  const totals = computeInvoice([{ description: 'Serviço', quantity: 1, unitPriceCents: c(100), vatRateCode: 'normal' }], ctx, P);

  it('aceita uma fatura completa', () => {
    expect(validateInvoice({ ...base, totals })).toEqual([]);
  });

  it('exige dados do emitente, NIF de cliente empresa, motivo de isenção e ordem cronológica', () => {
    const exempt = computeInvoice([{ description: 'X', quantity: 1, unitPriceCents: c(10), vatRateCode: 'isenta' }], ctx, P);
    const e = validateInvoice({
      ...base,
      issuer: { name: 'Marta', nif: null },
      client: { name: 'Empresa', isCompany: true },
      totals: exempt,
      lastIssueDateInSeries: '2025-03-11',
    });
    expect(e).toEqual([
      'Falta o teu NIF nas definições.',
      'Falta a tua morada completa nas definições.',
      'O NIF do cliente empresa é obrigatório.',
      'Linha 1: indica o motivo de isenção de IVA.',
      'A data não pode ser anterior à do último documento emitido nesta série.',
    ]);
  });

  it('limita a fatura simplificada a 100 € em serviços', () => {
    const big = computeInvoice([{ description: 'X', quantity: 1, unitPriceCents: c(200), vatRateCode: 'normal' }], { ...ctx, clientHasOrganizedAccounting: false }, P);
    expect(validateInvoice({ ...base, docType: 'FS', totals: big })).toHaveLength(1);
    expect(validateInvoice({ ...base, docType: 'FS', totals: big, isRetailSale: true })).toEqual([]);
  });

  it('ATCUD', () => {
    expect(buildAtcud('JJ37AB4C', 12)).toBe('JJ37AB4C-12');
  });
});
