/**
 * Teste de aceitação da Fase 2: o motor fiscal processa o caso de referência de ponta a ponta
 * (IVA trimestral, IRS no regime simplificado, Segurança Social e calendário), com os valores
 * calculados à mão em fixtures/eni-simplificado-2025/README.md.
 */
import { describe, expect, it } from 'vitest';
import {
  buildObligationCalendar,
  computeSocialSecurity,
  computeVatYear,
  createParamsResolver,
  estimateIrs,
  parseTaxParams,
  quarterOf,
  vatFromGross,
  type VatOperation,
} from '@somar/tax-engine';
import p2025 from '../../../packages/tax-engine/params/2025.json';
import p2026 from '../../../packages/tax-engine/params/2026.json';
import categories from '../../../packages/db/seed-data/categories.json';
import { fixture } from '../../eni-simplificado-2025';

const P = parseTaxParams(p2025);
const resolve = createParamsResolver([P, parseTaxParams(p2026)]);
const c = (eur: number) => Math.round(eur * 100);
const cat = new Map(categories.map((x) => [x.code, x]));
const receiptByTx = new Map(fixture.receipts.map((r) => [r.transactionId, r]));

/** Operações de IVA a partir das faturas emitidas e das despesas (justificativos) do caso de referência. */
function vatOperations(): VatOperation[] {
  const ops: VatOperation[] = fixture.invoices.map((i) => ({
    ref: i.number,
    date: i.issueDate,
    kind: 'output',
    netCents: i.netCents,
    vatCents: i.vatCents,
    rateCode: 'normal',
  }));
  for (const t of fixture.truth) {
    const k = cat.get(t.category)!;
    if (k.kind !== 'expense' || t.duplicate || !k.defaultVatRate || k.defaultVatRate === 'nao_sujeita') continue;
    const r = receiptByTx.get(t.id);
    const gross = -t.amountCents;
    const rate = (r?.vatRateCode ?? k.defaultVatRate) as VatOperation['rateCode'];
    const vat = r?.vatCents ?? vatFromGross(gross, rate === 'intermedia' ? 13 : rate === 'reduzida' ? 6 : 23);
    ops.push({
      ref: t.id,
      date: r?.documentDate ?? t.date,
      kind: 'input',
      netCents: r?.netCents ?? gross - vat,
      vatCents: vat,
      rateCode: rate,
      deductiblePct: P.vat.deductibility[k.vatDeductionKey],
      hasValidInvoice: !!r,
      bucket: k.vatBucket as VatOperation['bucket'],
    });
  }
  return ops;
}

describe('Fase 2 — caso de referência ENI 2025', () => {
  it('IVA trimestral: liquidado, dedutível e a pagar por trimestre', () => {
    const year = computeVatYear({ regime: 'normal_trimestral', year: 2025, operations: vatOperations() }, P);
    expect(year.map((q) => q.output.totalVatCents)).toEqual([c(1104), c(2415), c(1656), c(2277)]);
    expect(year.map((q) => q.input.deductibleCents)).toEqual([c(529), c(171.35), c(165.6), c(280.6)]);
    expect(year.map((q) => q.payableCents)).toEqual([c(575), c(2243.65), c(1490.4), c(1996.4)]);
    expect(year[0]!.fields['20']).toBe(c(345)); // computador no imobilizado
    expect(year[2]!.input.excludedWithoutInvoice).toEqual(['t061']); // despesa sem justificativo
    expect(year.map((q) => q.dueDates!.payment)).toEqual(['2025-05-26', '2025-08-25', '2025-11-25', '2026-02-25']);
    // Os pagamentos de IVA no extrato coincidem com o apuramento (T1 a T3)
    const paid = fixture.truth.filter((t) => t.category === 'pagamento_iva' && t.date > '2025-03-01').map((t) => -t.amountCents);
    expect(paid).toEqual([c(575), c(2243.65), c(1490.4)]);
  });

  it('IRS 2025 (regime simplificado): reembolso de 2 807,84 €', () => {
    const ops = vatOperations().filter((o) => o.kind === 'input' && o.hasValidInvoice !== false);
    const efatura = ops.reduce((s, o) => s + o.netCents + (o.vatCents - Math.round((o.vatCents * (o.deductiblePct ?? 100)) / 100)), 0);
    const ssPaid = -fixture.truth.filter((t) => t.category === 'seguranca_social').reduce((s, t) => s + t.amountCents, 0);
    expect(efatura).toBe(c(5049.65));
    expect(ssPaid).toBe(c(4479.02));
    const r = estimateIrs(
      {
        year: 2025,
        regime: 'irs_simplificado',
        activityStartDate: fixture.account.activityStartDate,
        incomes: [{ type: 'servicos_tabela_151', grossCents: fixture.invoices.reduce((s, i) => s + i.netCents, 0) }],
        socialSecurityPaidCents: ssPaid,
        justifiedExpenses: { efaturaCents: efatura },
        deductions: fixture.previousYear.personalDeductions2025,
        withholdingCents: fixture.invoices.reduce((s, i) => s + i.withholdingCents, 0),
      },
      P,
    );
    expect(r.catB.grossCents).toBe(c(32_400));
    expect(r.catB.justification).toEqual({ requiredCents: c(4860), justifiedCents: c(9528.67), additionCents: 0 });
    expect(r.collectableCents).toBe(c(24_300));
    expect(r.progressiveTaxCents).toBe(c(4618.16));
    expect(r.deductionsCents).toBe(c(250));
    expect(r.netTaxCents).toBe(c(4368.16));
    expect(r.withholdingCents).toBe(c(7176));
    expect(r.resultCents).toBe(c(-2807.84));
  });

  it('Segurança Social: contribuições por trimestre e total pago em 2025 igual ao extrato', () => {
    const quarters = new Map<string, number>();
    for (const i of fixture.invoices) {
      const key = `2025-${quarterOf(Number(i.issueDate.slice(5, 7)))}`;
      quarters.set(key, (quarters.get(key) ?? 0) + i.netCents);
    }
    const prev = fixture.previousYear.socialSecurity.incomeByQuarter2024;
    const r = computeSocialSecurity(
      {
        legalForm: 'eni',
        activityStartDate: fixture.account.activityStartDate,
        quarters: [
          { year: 2024, quarter: 3, byType: { servicos_tabela_151: prev['3'] } },
          { year: 2024, quarter: 4, byType: { servicos_tabela_151: prev['4'] } },
          ...[1, 2, 3, 4].map((q) => ({ year: 2025, quarter: q as 1 | 2 | 3 | 4, byType: { servicos_tabela_151: quarters.get(`2025-${q}`) ?? 0 } })),
        ],
      },
      resolve,
    );
    expect(r.quarters.map((q) => q.monthlyContributionCents)).toEqual([c(299.6), c(389.48), c(239.68), c(524.3), c(359.52), c(494.34)]);
    expect(r.paidByYear[2025]).toBe(c(4479.02));
    expect(r.byYear[2025]).toBe(c(4538.94));
  });

  it('calendário de obrigações de 2025 do caso de referência', () => {
    const a = fixture.account;
    const cal = buildObligationCalendar(
      { legalForm: a.legalForm as 'eni', vatRegime: a.vatRegime as 'normal_trimestral', incomeTaxRegime: 'irs_simplificado', activityStartDate: a.activityStartDate, invoicesAutoCommunicated: true },
      { from: '2025-01-01', to: '2025-12-31' },
      resolve,
    );
    expect(cal).toHaveLength(37);
    expect(cal.filter((o) => o.type === 'iva_pagamento').map((o) => o.dueDate)).toEqual(['2025-02-25', '2025-05-26', '2025-08-25', '2025-11-25']);
  });
});
