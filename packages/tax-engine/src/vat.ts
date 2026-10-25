import { addMonths, dayInMonth, monthRange, quarterRange, ym, type IsoDate } from './dates';
import { adjustDeadline } from './holidays';
import { roundCents, sum, vatFromNet } from './money';
import { legalRef, type TaxParams } from './params';
import type { Step, TaxRegion, VatRateCode, VatRegime } from './types';

// ---------------------------------------------------------------------------
// Taxas e validação de documentos
// ---------------------------------------------------------------------------

/** Taxa de IVA (%) para um código e região (art. 18.º CIVA). Isenta/não sujeita/autoliquidação = 0. */
export function vatRatePct(code: VatRateCode, region: TaxRegion, params: TaxParams): number {
  if (code === 'normal' || code === 'intermedia' || code === 'reduzida') return params.vat.rates[region][code];
  return 0;
}

export interface VatCheck {
  ok: boolean;
  expectedVatCents: number;
  differenceCents: number;
  message?: string;
}

/**
 * Verifica a coerência base/IVA/taxa de um documento. Usado para validar valores extraídos por OCR/IA
 * antes de os propor ao utilizador. Tolerância por omissão: 1 cêntimo por linha (arredondamentos).
 */
export function checkDocumentVat(
  doc: { netCents: number; vatCents: number; rateCode: VatRateCode; region: TaxRegion },
  params: TaxParams,
  toleranceCents = 1,
): VatCheck {
  const expected = vatFromNet(doc.netCents, vatRatePct(doc.rateCode, doc.region, params));
  const diff = doc.vatCents - expected;
  const ok = Math.abs(diff) <= toleranceCents;
  return {
    ok,
    expectedVatCents: expected,
    differenceCents: diff,
    message: ok ? undefined : `IVA indicado (${doc.vatCents / 100} €) não corresponde à taxa (${expected / 100} €).`,
  };
}

/** Infere o código de taxa a partir de base e IVA (útil para validar extrações de recibos). */
export function inferRateCode(netCents: number, vatCents: number, region: TaxRegion, params: TaxParams): VatRateCode | null {
  if (vatCents === 0) return 'isenta';
  for (const code of ['normal', 'intermedia', 'reduzida'] as const) {
    if (Math.abs(vatFromNet(netCents, params.vat.rates[region][code]) - vatCents) <= 1) return code;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Periodicidade, regime de isenção e prazos
// ---------------------------------------------------------------------------

export interface VatPeriod {
  start: IsoDate;
  end: IsoDate;
  label: string;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthName = (m: number) => MONTHS[m - 1]!;

/** Períodos de declaração do ano (art. 41.º CIVA). Regimes isentos não têm declaração periódica. */
export function vatPeriodsForYear(regime: VatRegime, year: number): VatPeriod[] {
  if (regime === 'normal_mensal') {
    return Array.from({ length: 12 }, (_, i) => ({ ...monthRange(year, i + 1), label: `${monthName(i + 1)} ${year}` }));
  }
  if (regime === 'normal_trimestral') {
    return [1, 2, 3, 4].map((q) => ({ ...quarterRange(year, q), label: `${q}.º trimestre ${year}` }));
  }
  return [];
}

export function vatPeriodFor(regime: VatRegime, date: IsoDate): VatPeriod | null {
  const [y] = ym(date);
  return vatPeriodsForYear(regime, y).find((p) => p.start <= date && date <= p.end) ?? null;
}

/**
 * Prazos da declaração periódica e do pagamento: dia N do 2.º mês seguinte ao fim do período
 * (art. 41.º, n.º 1 e art. 27.º, n.º 1 CIVA), transferidos para o dia útil seguinte quando aplicável.
 */
export function vatDueDates(periodEnd: IsoDate, params: TaxParams): { declaration: IsoDate; payment: IsoDate } {
  const [y, m] = ym(periodEnd);
  const [dy, dm] = addMonths(y, m, params.vat.deadlines.monthsAfterPeriodEnd);
  return {
    declaration: adjustDeadline(dayInMonth(dy, dm, params.vat.deadlines.declarationDay)),
    payment: adjustDeadline(dayInMonth(dy, dm, params.vat.deadlines.paymentDay)),
  };
}

/** Periodicidade obrigatória em função do volume de negócios do ano anterior (art. 41.º CIVA). */
export function requiredVatPeriodicity(previousYearTurnoverCents: number, params: TaxParams): 'normal_mensal' | 'normal_trimestral' {
  return previousYearTurnoverCents >= params.vat.monthlyPeriodicityThresholdCents ? 'normal_mensal' : 'normal_trimestral';
}

export interface Art53Assessment {
  eligible: boolean;
  /** Ultrapassou o limite: passa ao regime normal a partir do ano seguinte. */
  exitNextYear: boolean;
  /** Ultrapassou o limite em mais de 25%: cessa no mês seguinte (verificar regra em vigor). */
  exitImmediately: boolean;
  reasons: string[];
  legalRef: string;
}

/** Avalia o enquadramento no regime especial de isenção (art. 53.º CIVA). */
export function assessArt53(
  input: {
    previousYearTurnoverCents: number;
    currentYearTurnoverCents: number;
    hasOrganizedAccounting: boolean;
    performsImportExport?: boolean;
  },
  params: TaxParams,
): Art53Assessment {
  const { thresholdCents, immediateExitThresholdCents } = params.vat.art53;
  const reasons: string[] = [];
  if (input.hasOrganizedAccounting) reasons.push('Tem (ou deve ter) contabilidade organizada.');
  if (input.performsImportExport) reasons.push('Pratica operações de importação/exportação.');
  if (input.previousYearTurnoverCents > thresholdCents)
    reasons.push(`Volume de negócios do ano anterior acima de ${thresholdCents / 100} €.`);
  const exitImmediately = input.currentYearTurnoverCents > immediateExitThresholdCents;
  const exitNextYear = input.currentYearTurnoverCents > thresholdCents;
  if (exitImmediately) reasons.push(`Volume de negócios deste ano acima de ${immediateExitThresholdCents / 100} €.`);
  return {
    eligible: reasons.length === 0,
    exitNextYear,
    exitImmediately,
    reasons,
    legalRef: legalRef(params, 'vat.art53') || 'Art. 53.º CIVA',
  };
}

// ---------------------------------------------------------------------------
// Apuramento do período
// ---------------------------------------------------------------------------

export type VatBucket = 'imobilizado' | 'existencias' | 'outros';

export interface VatOperation {
  ref?: string;
  date: IsoDate;
  /** output = IVA liquidado (vendas/prestações); input = IVA suportado (compras). */
  kind: 'output' | 'input';
  /** Base tributável em cêntimos (negativa em notas de crédito). */
  netCents: number;
  /** IVA do documento em cêntimos. */
  vatCents: number;
  rateCode: VatRateCode;
  /** Compras: % do IVA dedutível pela natureza da despesa (art. 21.º CIVA). Por omissão 100. */
  deductiblePct?: number;
  /** Compras: % de afetação à atividade (despesas mistas). Por omissão 100. */
  businessPct?: number;
  /** Compras: existe fatura em nome e com o NIF do sujeito passivo (art. 19.º, n.º 2 CIVA). */
  hasValidInvoice?: boolean;
  bucket?: VatBucket;
}

export interface VatPeriodInput {
  regime: VatRegime;
  period: { start: IsoDate; end: IsoDate };
  operations: VatOperation[];
  /** Crédito de IVA reportado do período anterior (campo 61). */
  carryForwardCents?: number;
}

type RateTotals = Record<'normal' | 'intermedia' | 'reduzida', { baseCents: number; vatCents: number }>;

export interface VatPeriodResult {
  applicable: boolean;
  period: { start: IsoDate; end: IsoDate };
  output: { byRate: RateTotals; exemptBaseCents: number; reverseChargeBaseCents: number; totalVatCents: number };
  input: {
    deductibleCents: number;
    nonDeductibleCents: number;
    byBucket: Record<VatBucket, number>;
    existenciasByRate: Record<'normal' | 'intermedia' | 'reduzida', number>;
    excludedWithoutInvoice: string[];
  };
  carryForwardInCents: number;
  /** Positivo = imposto a entregar ao Estado; negativo = crédito. */
  balanceCents: number;
  payableCents: number;
  creditCents: number;
  /** Valores de apoio por campo do Quadro 06 da declaração periódica (continente). */
  fields: Record<string, number>;
  dueDates?: { declaration: IsoDate; payment: IsoDate };
  steps: Step[];
  warnings: string[];
}

const emptyRates = (): RateTotals => ({
  normal: { baseCents: 0, vatCents: 0 },
  intermedia: { baseCents: 0, vatCents: 0 },
  reduzida: { baseCents: 0, vatCents: 0 },
});

/**
 * Apura o IVA de um período: IVA liquidado nas operações ativas menos IVA dedutível nas compras
 * (arts. 19.º a 22.º CIVA), mais o crédito reportado. O IVA é exigível na data da fatura (arts. 7.º e 8.º).
 */
export function computeVatPeriod(input: VatPeriodInput, params: TaxParams): VatPeriodResult {
  const { start, end } = input.period;
  const ops = input.operations.filter((o) => o.date >= start && o.date <= end);
  const warnings: string[] = [];
  const steps: Step[] = [];

  if (input.regime === 'isento_art53' || input.regime === 'isento_art9') {
    const exempt = sum(ops.filter((o) => o.kind === 'output').map((o) => o.netCents));
    return {
      applicable: false,
      period: { start, end },
      output: { byRate: emptyRates(), exemptBaseCents: exempt, reverseChargeBaseCents: 0, totalVatCents: 0 },
      input: { deductibleCents: 0, nonDeductibleCents: 0, byBucket: { imobilizado: 0, existencias: 0, outros: 0 }, existenciasByRate: { normal: 0, intermedia: 0, reduzida: 0 }, excludedWithoutInvoice: [] },
      carryForwardInCents: 0,
      balanceCents: 0,
      payableCents: 0,
      creditCents: 0,
      fields: {},
      steps: [
        {
          code: 'vat.exempt',
          label:
            input.regime === 'isento_art53'
              ? 'Regime de isenção do art. 53.º: não liquidas IVA nem deduzes o IVA das compras.'
              : 'Operações isentas do art. 9.º: não liquidas IVA nem deduzes o IVA das compras.',
          legalRef: input.regime === 'isento_art53' ? 'Art. 53.º CIVA' : 'Art. 9.º CIVA',
        },
      ],
      warnings,
    };
  }

  const byRate = emptyRates();
  let exemptBase = 0;
  let reverseBase = 0;
  for (const o of ops.filter((x) => x.kind === 'output')) {
    if (o.rateCode === 'normal' || o.rateCode === 'intermedia' || o.rateCode === 'reduzida') {
      byRate[o.rateCode].baseCents += o.netCents;
      byRate[o.rateCode].vatCents += o.vatCents;
    } else if (o.rateCode === 'autoliquidacao') {
      reverseBase += o.netCents;
    } else {
      exemptBase += o.netCents;
    }
  }
  const outputVat = byRate.normal.vatCents + byRate.intermedia.vatCents + byRate.reduzida.vatCents;

  const byBucket: Record<VatBucket, number> = { imobilizado: 0, existencias: 0, outros: 0 };
  const existenciasByRate = { normal: 0, intermedia: 0, reduzida: 0 };
  let deductible = 0;
  let nonDeductible = 0;
  const excluded: string[] = [];
  for (const o of ops.filter((x) => x.kind === 'input')) {
    if (o.hasValidInvoice === false) {
      // Sem fatura válida em nome do sujeito passivo não há direito à dedução (art. 19.º, n.º 2 CIVA).
      nonDeductible += o.vatCents;
      excluded.push(o.ref ?? o.date);
      continue;
    }
    const share = ((o.deductiblePct ?? 100) / 100) * ((o.businessPct ?? 100) / 100);
    const d = roundCents(o.vatCents * share);
    deductible += d;
    nonDeductible += o.vatCents - d;
    const bucket = o.bucket ?? 'outros';
    byBucket[bucket] += d;
    if (bucket === 'existencias' && (o.rateCode === 'normal' || o.rateCode === 'intermedia' || o.rateCode === 'reduzida')) {
      existenciasByRate[o.rateCode] += d;
    }
  }
  if (excluded.length) warnings.push(`${excluded.length} despesa(s) sem fatura válida: IVA não dedutível.`);

  const carry = input.carryForwardCents ?? 0;
  const balance = outputVat - deductible - carry;

  steps.push(
    { code: 'vat.output', label: 'IVA que cobraste aos clientes (liquidado)', amountCents: outputVat, legalRef: 'Arts. 7.º, 16.º e 18.º CIVA' },
    { code: 'vat.input', label: 'IVA das despesas que podes deduzir', amountCents: -deductible, legalRef: 'Arts. 19.º a 21.º CIVA' },
  );
  if (carry) steps.push({ code: 'vat.carry', label: 'Crédito de IVA do período anterior', amountCents: -carry, legalRef: 'Art. 22.º CIVA' });
  steps.push({
    code: 'vat.balance',
    label: balance >= 0 ? 'IVA a entregar ao Estado' : 'Crédito de IVA a reportar',
    amountCents: Math.abs(balance),
  });

  const fields: Record<string, number> = {
    '1': byRate.reduzida.baseCents,
    '2': byRate.reduzida.vatCents,
    '5': byRate.intermedia.baseCents,
    '6': byRate.intermedia.vatCents,
    '3': byRate.normal.baseCents,
    '4': byRate.normal.vatCents,
    '20': byBucket.imobilizado,
    '21': existenciasByRate.reduzida,
    '23': existenciasByRate.intermedia,
    '22': existenciasByRate.normal,
    '24': byBucket.outros + (byBucket.existencias - sum(Object.values(existenciasByRate))),
    '61': carry,
    '93': Math.max(balance, 0),
    '96': Math.max(-balance, 0),
  };

  return {
    applicable: true,
    period: { start, end },
    output: { byRate, exemptBaseCents: exemptBase, reverseChargeBaseCents: reverseBase, totalVatCents: outputVat },
    input: { deductibleCents: deductible, nonDeductibleCents: nonDeductible, byBucket, existenciasByRate, excludedWithoutInvoice: excluded },
    carryForwardInCents: carry,
    balanceCents: balance,
    payableCents: Math.max(balance, 0),
    creditCents: Math.max(-balance, 0),
    fields,
    dueDates: vatDueDates(end, params),
    steps,
    warnings,
  };
}

/** Apura todos os períodos de um ano, propagando o crédito de período para período. */
export function computeVatYear(
  input: { regime: VatRegime; year: number; operations: VatOperation[]; openingCreditCents?: number },
  params: TaxParams,
): VatPeriodResult[] {
  let carry = input.openingCreditCents ?? 0;
  return vatPeriodsForYear(input.regime, input.year).map((p) => {
    const r = computeVatPeriod({ regime: input.regime, period: p, operations: input.operations, carryForwardCents: carry }, params);
    carry = r.creditCents;
    return r;
  });
}

