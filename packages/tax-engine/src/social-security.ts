import { addMonths, dayInMonth, monthIndex, type IsoDate } from './dates';
import { adjustDeadline } from './holidays';
import { roundCents, sum } from './money';
import { legalRef, type ParamsResolver } from './params';
import type { IrsIncomeType, LegalForm, Step } from './types';

/**
 * Contribuições dos trabalhadores independentes (Código dos Regimes Contributivos, arts. 132.º–168.º):
 *  - rendimento relevante do trimestre = 70% das prestações de serviços + 20% das vendas/hotelaria (art. 162.º);
 *  - base de incidência mensal = 1/3 do rendimento relevante do trimestre anterior (art. 163.º),
 *    ajustável em ±25% em escalões de 5% e limitada a 12 × IAS;
 *  - taxa de 21,4% (25,2% para ENI e cônjuges) (art. 168.º); contribuição mínima de 20 €;
 *  - isenção nos primeiros 12 meses de atividade e em acumulação com trabalho por conta de outrem
 *    (art. 157.º, condições simplificadas);
 *  - declaração trimestral em janeiro, abril, julho e outubro; pagamento até ao dia 20 do mês seguinte.
 */

export interface SsQuarterIncome {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  /** Valores faturados no trimestre (sem IVA), por tipo de rendimento. */
  byType: Partial<Record<IrsIncomeType, number>>;
}

export interface SsInput {
  legalForm: LegalForm;
  activityStartDate: IsoDate;
  eniWithSpouse?: boolean;
  /** Rendimento mensal de trabalho por conta de outrem (para a isenção por acumulação). */
  employmentMonthlyGrossCents?: number;
  /** Ajuste voluntário da base (−25 a +25, múltiplos de 5). */
  baseAdjustmentPct?: number;
  quarters: SsQuarterIncome[];
}

export interface SsMonth {
  /** Mês a que respeita a contribuição (AAAA-MM). */
  month: string;
  contributionCents: number;
  /** Prazo de pagamento (dia 20 do mês seguinte, ajustado a dia útil). */
  dueDate: IsoDate;
  paymentWindowStart: IsoDate;
  exemptReason?: string;
}

export interface SsQuarterResult {
  year: number;
  quarter: number;
  incomeCents: number;
  relevantIncomeCents: number;
  monthlyBaseCents: number;
  rate: number;
  monthlyContributionCents: number;
  /** Declaração trimestral (prazo: último dia do mês seguinte ao trimestre). */
  declarationDueDate: IsoDate;
  months: SsMonth[];
  steps: Step[];
}

export interface SsResult {
  quarters: SsQuarterResult[];
  totalCents: number;
  /** Total de contribuições por ano a que os meses respeitam. */
  byYear: Record<number, number>;
  /** Total pago por ano civil (data de pagamento). */
  paidByYear: Record<number, number>;
}

function quarterDeclarationMonth(year: number, quarter: number): [number, number] {
  return addMonths(year, quarter * 3, 1); // mês seguinte ao fim do trimestre
}

export function computeSocialSecurity(input: SsInput, resolve: ParamsResolver): SsResult {
  const startIdx = monthIndex(input.activityStartDate);
  const results: SsQuarterResult[] = [];

  for (const q of [...input.quarters].sort((a, b) => a.year * 4 + a.quarter - (b.year * 4 + b.quarter))) {
    const [dy, dm] = quarterDeclarationMonth(q.year, q.quarter);
    const params = resolve(dy);
    const ss = params.socialSecurity;
    const steps: Step[] = [];

    const income = sum(Object.values(q.byType).map((v) => v ?? 0));
    const relevantRaw = sum(
      Object.entries(q.byType).map(([t, v]) => (v ?? 0) * ss.relevantIncomeCoefficients[t as IrsIncomeType]),
    );
    const relevant = roundCents(relevantRaw);
    steps.push({
      code: 'ss.relevant',
      label: 'Rendimento relevante do trimestre (70% serviços, 20% vendas)',
      amountCents: relevant,
      legalRef: legalRef(params, 'socialSecurity.relevantIncomeCoefficients') || 'Art. 162.º CRC',
    });

    const adj = input.baseAdjustmentPct ?? 0;
    const { minPct, maxPct, stepPct } = ss.baseAdjustment;
    if (adj < minPct || adj > maxPct || adj % stepPct !== 0) throw new Error(`Ajuste da base inválido: ${adj}%`);
    let base = (relevant / 3) * (1 + adj / 100);
    const maxBase = ss.maxBaseIasMultiple * ss.iasCents;
    if (base > maxBase) {
      base = maxBase;
      steps.push({ code: 'ss.cap', label: `Base limitada a ${ss.maxBaseIasMultiple} × IAS`, amountCents: maxBase });
    }
    const monthlyBase = roundCents(base);
    const rate = input.legalForm === 'eni' && input.eniWithSpouse ? ss.rateEniWithSpouse : ss.rate;
    let monthly = roundCents(monthlyBase * rate);
    if (relevant > 0 && monthly < ss.minimumContributionCents) monthly = ss.minimumContributionCents;
    steps.push(
      { code: 'ss.base', label: 'Base de incidência mensal (1/3 do rendimento relevante)', amountCents: monthlyBase, legalRef: 'Art. 163.º CRC' },
      { code: 'ss.contribution', label: `Contribuição mensal (${(rate * 100).toFixed(1)}%)`, amountCents: monthly, rate, legalRef: 'Art. 168.º CRC' },
    );

    const months: SsMonth[] = [];
    for (let i = 0; i < 3; i++) {
      const [my, mm] = addMonths(dy, dm, i);
      const mParams = resolve(my).socialSecurity;
      const [py, pm] = addMonths(my, mm, 1);
      let contribution = monthly;
      let exemptReason: string | undefined;
      if (my * 12 + (mm - 1) < startIdx + mParams.exemptionFirstMonths) {
        contribution = 0;
        exemptReason = 'Isento nos primeiros 12 meses de atividade.';
      } else if (
        input.employmentMonthlyGrossCents != null &&
        input.employmentMonthlyGrossCents >= mParams.accumulationExemption.minEmploymentMonthlyIasMultiple * mParams.iasCents &&
        relevant / 3 < mParams.accumulationExemption.maxRelevantMonthlyIasMultiple * mParams.iasCents
      ) {
        contribution = 0;
        exemptReason = 'Isento por acumulação com trabalho por conta de outrem.';
      }
      months.push({
        month: `${my}-${String(mm).padStart(2, '0')}`,
        contributionCents: contribution,
        dueDate: adjustDeadline(dayInMonth(py, pm, mParams.paymentDay)),
        paymentWindowStart: dayInMonth(py, pm, mParams.paymentWindowStartDay),
        exemptReason,
      });
    }

    results.push({
      year: q.year,
      quarter: q.quarter,
      incomeCents: income,
      relevantIncomeCents: relevant,
      monthlyBaseCents: monthlyBase,
      rate,
      monthlyContributionCents: monthly,
      declarationDueDate: adjustDeadline(dayInMonth(dy, dm, 'last')),
      months,
      steps,
    });
  }

  const byYear: Record<number, number> = {};
  const paidByYear: Record<number, number> = {};
  for (const r of results)
    for (const m of r.months) {
      const y = Number(m.month.slice(0, 4));
      byYear[y] = (byYear[y] ?? 0) + m.contributionCents;
      const py = Number(m.dueDate.slice(0, 4));
      paidByYear[py] = (paidByYear[py] ?? 0) + m.contributionCents;
    }
  return { quarters: results, totalCents: sum(Object.values(byYear)), byYear, paidByYear };
}
