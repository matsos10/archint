import { roundCents, sum } from './money';
import { legalRef, type TaxParams } from './params';
import type { IrsIncomeType, Step } from './types';
import type { IsoDate } from './dates';

/** Imposto progressivo pelos escalões do art. 68.º CIRS (cálculo marginal, equivalente à taxa média + excedente). */
export function progressiveTax(collectableCents: number, params: TaxParams) {
  let remaining = Math.max(0, collectableCents);
  let lower = 0;
  let tax = 0;
  let marginalRate = params.irs.brackets[0]!.rate;
  const parts: { fromCents: number; toCents: number; rate: number; taxCents: number }[] = [];
  for (const b of params.irs.brackets) {
    if (remaining <= 0) break;
    const width = b.upToCents === null ? remaining : Math.min(remaining, b.upToCents - lower);
    const t = width * b.rate;
    parts.push({ fromCents: lower, toCents: lower + width, rate: b.rate, taxCents: roundCents(t) });
    tax += t;
    marginalRate = b.rate;
    remaining -= width;
    lower = b.upToCents ?? lower + width;
  }
  const taxCents = roundCents(tax);
  return { taxCents, marginalRate, averageRate: collectableCents > 0 ? taxCents / collectableCents : 0, parts };
}

/** Taxa adicional de solidariedade (art. 68.º-A CIRS) sobre a parte do rendimento coletável acima dos limiares. */
export function solidaritySurcharge(collectableCents: number, params: TaxParams): number {
  let t = 0;
  for (const s of params.irs.solidarity) {
    const top = s.toCents ?? Infinity;
    if (collectableCents > s.fromCents) t += (Math.min(collectableCents, top) - s.fromCents) * s.rate;
  }
  return roundCents(t);
}

export interface IrsIncomeLine {
  type: IrsIncomeType;
  /** Rendimento bruto faturado no ano, sem IVA. */
  grossCents: number;
}

export interface IrsInput {
  year: number;
  regime: 'irs_simplificado' | 'irs_contabilidade_organizada';
  incomes: IrsIncomeLine[];
  activityStartDate: IsoDate;
  /** Teve rendimentos da categoria A (trabalho dependente) no ano. */
  hasEmploymentIncome?: boolean;
  employment?: { grossCents: number; socialSecurityCents: number; withholdingCents: number };
  /** Regime simplificado: despesas e encargos para a justificação dos 15% (art. 31.º, n.º 13 CIRS). */
  justifiedExpenses?: {
    /** Aquisições de bens e serviços comunicadas no e-fatura e afetas à atividade. */
    efaturaCents?: number;
    staffCents?: number;
    rentCents?: number;
    propertyCents?: number;
    professionalFeesCents?: number;
  };
  /** Contribuições obrigatórias para a Segurança Social pagas no ano. */
  socialSecurityPaidCents?: number;
  /** Contabilidade organizada: gastos fiscalmente dedutíveis do ano. */
  deductibleExpensesCents?: number;
  /** Despesas para deduções à coleta. */
  deductions?: {
    generalFamilyExpensesCents?: number;
    healthExpensesCents?: number;
    educationExpensesCents?: number;
    dependents?: number;
    dependentsUnder6?: number;
  };
  /** Retenções na fonte suportadas (categoria B). */
  withholdingCents?: number;
  paymentsOnAccountCents?: number;
}

export interface IrsResult {
  year: number;
  regime: IrsInput['regime'];
  catB: {
    grossCents: number;
    byType: { type: IrsIncomeType; grossCents: number; coefficient: number; effectiveCoefficient: number; taxableCents: number }[];
    justification?: { requiredCents: number; justifiedCents: number; additionCents: number };
    taxableCents: number;
  };
  catA?: { grossCents: number; deductionCents: number; netCents: number };
  collectableCents: number;
  progressiveTaxCents: number;
  marginalRate: number;
  averageRate: number;
  solidarityCents: number;
  grossTaxCents: number;
  deductionsCents: number;
  minimoExistenciaReliefCents: number;
  netTaxCents: number;
  withholdingCents: number;
  paymentsOnAccountCents: number;
  /** Positivo = a pagar; negativo = reembolso. */
  resultCents: number;
  effectiveRate: number;
  steps: Step[];
  warnings: string[];
}

function activityYearIndex(activityStartDate: IsoDate, year: number) {
  return year - Number(activityStartDate.slice(0, 4)); // 0 = ano de início
}

/** Coeficiente efetivo do regime simplificado, com a redução de início de atividade (art. 31.º, n.º 10 CIRS). */
export function simplifiedCoefficient(
  type: IrsIncomeType,
  ctx: { year: number; activityStartDate: IsoDate; hasEmploymentIncome?: boolean },
  params: TaxParams,
): { coefficient: number; effective: number; reduction: number } {
  const coefficient = params.irs.simplified.coefficients[type];
  const sr = params.irs.simplified.startReduction;
  let reduction = 0;
  if (sr.appliesTo.includes(type) && !ctx.hasEmploymentIncome) {
    const idx = activityYearIndex(ctx.activityStartDate, ctx.year);
    if (idx === 0) reduction = sr.firstYear;
    else if (idx === 1) reduction = sr.secondYear;
  }
  return { coefficient, effective: coefficient * (1 - reduction), reduction };
}

/** Deduções à coleta (arts. 78.º a 78.º-D CIRS), na versão simplificada usada nas estimativas. */
export function taxCredits(d: IrsInput['deductions'], params: TaxParams) {
  const p = params.irs.deductions;
  const general = Math.min(roundCents((d?.generalFamilyExpensesCents ?? 0) * p.generalFamilyPct), p.generalFamilyCapPerTaxpayerCents);
  const health = Math.min(roundCents((d?.healthExpensesCents ?? 0) * p.healthPct), p.healthCapCents);
  const education = Math.min(roundCents((d?.educationExpensesCents ?? 0) * p.educationPct), p.educationCapCents);
  const dependents = (d?.dependents ?? 0) * p.dependentCents + (d?.dependentsUnder6 ?? 0) * p.dependentUnder6ExtraCents;
  return { general, health, education, dependents, total: general + health + education + dependents };
}

/**
 * Estimativa do IRS anual de um sujeito passivo com rendimentos da categoria B (tributação separada,
 * sem quociente conjugal). Passos:
 *  1. Rendimento tributável da cat. B: coeficientes do art. 31.º (simplificado) ou lucro (art. 32.º, organizada);
 *  2. Acréscimo pela falta de justificação dos 15% (art. 31.º, n.º 13);
 *  3. Englobamento com a cat. A líquida (art. 22.º e art. 25.º);
 *  4. Taxas gerais (art. 68.º) e adicional de solidariedade (art. 68.º-A);
 *  5. Deduções à coleta (art. 78.º) e mínimo de existência (art. 70.º, versão simplificada);
 *  6. Retenções na fonte (art. 101.º) e pagamentos por conta (art. 102.º).
 */
export function estimateIrs(input: IrsInput, params: TaxParams): IrsResult {
  const steps: Step[] = [];
  const warnings: string[] = [];
  const gross = sum(input.incomes.map((i) => i.grossCents));

  // Agrupa por tipo de rendimento
  const grouped = new Map<IrsIncomeType, number>();
  for (const i of input.incomes) grouped.set(i.type, (grouped.get(i.type) ?? 0) + i.grossCents);

  const byType: IrsResult['catB']['byType'] = [];
  let justification: IrsResult['catB']['justification'];
  let catBTaxable: number;

  if (input.regime === 'irs_simplificado') {
    if (gross > params.irs.simplified.maxGrossCents) {
      warnings.push(
        `Rendimentos acima de ${params.irs.simplified.maxGrossCents / 100} €: a contabilidade organizada passa a ser obrigatória no ano seguinte (art. 28.º CIRS).`,
      );
    }
    let base = 0;
    for (const [type, g] of grouped) {
      const c = simplifiedCoefficient(type, input, params);
      const taxable = g * c.effective;
      base += taxable;
      byType.push({ type, grossCents: g, coefficient: c.coefficient, effectiveCoefficient: c.effective, taxableCents: roundCents(taxable) });
      steps.push({
        code: `irs.coef.${type}`,
        label:
          c.reduction > 0
            ? `Rendimento ${type.replace(/_/g, ' ')} × ${c.coefficient} com redução de ${c.reduction * 100}% (início de atividade)`
            : `Rendimento ${type.replace(/_/g, ' ')} × coeficiente ${c.coefficient}`,
        amountCents: roundCents(taxable),
        rate: c.effective,
        legalRef: legalRef(params, 'irs.simplified.coefficients') || 'Art. 31.º, n.º 1 CIRS',
      });
    }

    // Justificação dos 15% (art. 31.º, n.º 13): acresce a diferença entre 15% dos rendimentos abrangidos
    // e as despesas/deduções justificadas.
    const ej = params.irs.simplified.expenseJustification;
    const covered = sum([...grouped].filter(([t]) => ej.appliesTo.includes(t)).map(([, g]) => g));
    let addition = 0;
    if (covered > 0) {
      const required = roundCents(covered * ej.pct);
      const automatic = input.hasEmploymentIncome ? 0 : params.irs.specificDeductionCents;
      const ss = input.socialSecurityPaidCents ?? 0;
      const e = input.justifiedExpenses ?? {};
      const justified =
        Math.max(automatic, ss) +
        (e.efaturaCents ?? 0) +
        (e.staffCents ?? 0) +
        (e.rentCents ?? 0) +
        (e.propertyCents ?? 0) +
        (e.professionalFeesCents ?? 0);
      addition = Math.max(0, required - justified);
      justification = { requiredCents: required, justifiedCents: justified, additionCents: addition };
      steps.push({
        code: 'irs.justification',
        label:
          addition > 0
            ? `Despesas justificadas (${justified / 100} €) abaixo de ${ej.pct * 100}% dos rendimentos (${required / 100} €): acresce a diferença`
            : `Despesas justificadas (${justified / 100} €) cobrem os ${ej.pct * 100}% exigidos (${required / 100} €)`,
        amountCents: addition,
        legalRef: legalRef(params, 'irs.simplified.expenseJustification') || 'Art. 31.º, n.º 13 CIRS',
      });
      if (input.hasEmploymentIncome) {
        warnings.push('Com rendimentos da categoria A, a dedução automática não foi considerada na justificação dos 15% (estimativa conservadora).');
      }
    }
    catBTaxable = roundCents(base) + addition;
  } else {
    const expenses = input.deductibleExpensesCents ?? 0;
    catBTaxable = Math.max(0, gross - expenses);
    for (const [type, g] of grouped) byType.push({ type, grossCents: g, coefficient: 1, effectiveCoefficient: 1, taxableCents: g });
    steps.push({
      code: 'irs.organized',
      label: 'Lucro tributável: rendimentos menos gastos dedutíveis',
      amountCents: catBTaxable,
      legalRef: 'Art. 32.º CIRS (remete para o CIRC)',
    });
    if (gross - expenses < 0) warnings.push('Prejuízo fiscal: pode ser reportado nos anos seguintes (não incluído na estimativa).');
  }

  // Categoria A (se existir)
  let catA: IrsResult['catA'];
  if (input.employment && input.employment.grossCents > 0) {
    const deduction = Math.min(input.employment.grossCents, Math.max(params.irs.specificDeductionCents, input.employment.socialSecurityCents));
    catA = { grossCents: input.employment.grossCents, deductionCents: deduction, netCents: input.employment.grossCents - deduction };
    steps.push({ code: 'irs.catA', label: 'Rendimento líquido do trabalho dependente', amountCents: catA.netCents, legalRef: 'Art. 25.º CIRS' });
  }

  const collectable = catBTaxable + (catA?.netCents ?? 0);
  steps.push({ code: 'irs.collectable', label: 'Rendimento coletável', amountCents: collectable, legalRef: 'Art. 22.º CIRS' });

  const prog = progressiveTax(collectable, params);
  steps.push({
    code: 'irs.progressive',
    label: `Imposto pelas taxas gerais (taxa marginal ${(prog.marginalRate * 100).toFixed(1)}%)`,
    amountCents: prog.taxCents,
    legalRef: legalRef(params, 'irs.brackets') || 'Art. 68.º CIRS',
  });
  const solidarity = solidaritySurcharge(collectable, params);
  if (solidarity > 0) {
    steps.push({ code: 'irs.solidarity', label: 'Taxa adicional de solidariedade', amountCents: solidarity, legalRef: 'Art. 68.º-A CIRS' });
  }
  const grossTax = prog.taxCents + solidarity;

  const credits = taxCredits(input.deductions, params);
  const deductionsApplied = Math.min(credits.total, grossTax);
  if (deductionsApplied > 0) {
    steps.push({ code: 'irs.deductions', label: 'Deduções à coleta (despesas gerais, saúde, educação, dependentes)', amountCents: -deductionsApplied, legalRef: legalRef(params, 'irs.deductions') || 'Art. 78.º CIRS' });
  }
  let netTax = grossTax - deductionsApplied;

  // Mínimo de existência (art. 70.º) — versão simplificada: o rendimento líquido de imposto não pode
  // ficar abaixo do mínimo, para rendimentos predominantemente de trabalho dependente ou de atividades do art. 151.º.
  let relief = 0;
  const predominantlyEligible =
    (catA?.grossCents ?? 0) + (grouped.get('servicos_tabela_151') ?? 0) >= (gross + (catA?.grossCents ?? 0)) / 2;
  if (predominantlyEligible && netTax > 0) {
    const maxTax = Math.max(0, collectable - params.irs.minimoExistenciaCents);
    if (netTax > maxTax) {
      relief = netTax - maxTax;
      netTax = maxTax;
      steps.push({ code: 'irs.minimo', label: 'Ajuste pelo mínimo de existência', amountCents: -relief, legalRef: legalRef(params, 'irs.minimoExistenciaCents') || 'Art. 70.º CIRS' });
    }
  }

  const withholding = (input.withholdingCents ?? 0) + (input.employment?.withholdingCents ?? 0);
  const ppc = input.paymentsOnAccountCents ?? 0;
  if (withholding) steps.push({ code: 'irs.withholding', label: 'Retenções na fonte já descontadas', amountCents: -withholding, legalRef: 'Arts. 99.º e 101.º CIRS' });
  if (ppc) steps.push({ code: 'irs.ppc', label: 'Pagamentos por conta já feitos', amountCents: -ppc, legalRef: 'Art. 102.º CIRS' });
  const result = netTax - withholding - ppc;
  steps.push({ code: 'irs.result', label: result >= 0 ? 'IRS a pagar' : 'IRS a receber (reembolso)', amountCents: Math.abs(result) });

  return {
    year: input.year,
    regime: input.regime,
    catB: { grossCents: gross, byType, justification, taxableCents: catBTaxable },
    catA,
    collectableCents: collectable,
    progressiveTaxCents: prog.taxCents,
    marginalRate: prog.marginalRate,
    averageRate: prog.averageRate,
    solidarityCents: solidarity,
    grossTaxCents: grossTax,
    deductionsCents: deductionsApplied,
    minimoExistenciaReliefCents: relief,
    netTaxCents: netTax,
    withholdingCents: withholding,
    paymentsOnAccountCents: ppc,
    resultCents: result,
    effectiveRate: gross > 0 ? netTax / (gross + (catA?.grossCents ?? 0)) : 0,
    steps,
    warnings,
  };
}

/**
 * Retenção na fonte numa fatura de categoria B (art. 101.º CIRS): só quando o adquirente tem
 * contabilidade organizada e o prestador não está dispensado (art. 101.º-B).
 */
export function withholdingFor(
  input: { netCents: number; incomeType: IrsIncomeType; clientHasOrganizedAccounting: boolean; providerExempt: boolean },
  params: TaxParams,
): { rate: number; withholdingCents: number; reason: string } {
  if (!input.clientHasOrganizedAccounting) return { rate: 0, withholdingCents: 0, reason: 'Cliente sem contabilidade organizada (ex.: particular).' };
  if (input.providerExempt) return { rate: 0, withholdingCents: 0, reason: 'Dispensa de retenção (art. 101.º-B CIRS).' };
  const rates = params.irs.withholding.rates;
  const rate =
    input.incomeType === 'servicos_tabela_151'
      ? rates.servicos_tabela_151
      : input.incomeType === 'propriedade_intelectual'
        ? rates.propriedade_intelectual
        : input.incomeType === 'servicos_outros'
          ? rates.servicos_outros
          : 0;
  return { rate, withholdingCents: roundCents(input.netCents * rate), reason: rate ? 'Retenção na fonte (art. 101.º CIRS).' : 'Sem retenção para este tipo de rendimento.' };
}

/** Pode pedir a dispensa de retenção se os rendimentos do ano anterior não excederem o limite (art. 101.º-B). */
export function canClaimWithholdingExemption(previousYearGrossCents: number, params: TaxParams): boolean {
  return previousYearGrossCents <= params.irs.withholding.exemptionThresholdCents;
}

/**
 * Pagamentos por conta (art. 102.º CIRS): 76,5% de (coleta do penúltimo ano × peso da cat. B − retenções),
 * divididos em três prestações; dispensados abaixo do mínimo. Estimativa: a AT notifica o valor exato.
 */
export function irsPaymentsOnAccount(
  input: { baseYearNetTaxCents: number; baseYearCatBShare: number; baseYearCatBWithholdingCents: number },
  params: TaxParams,
): { totalCents: number; installmentCents: number[] } {
  const base = input.baseYearNetTaxCents * input.baseYearCatBShare - input.baseYearCatBWithholdingCents;
  const total = roundCents(Math.max(0, base) * params.irs.paymentsOnAccount.rate);
  if (total < params.irs.paymentsOnAccount.minimumCents) return { totalCents: 0, installmentCents: [0, 0, 0] };
  const each = Math.floor(total / 3);
  return { totalCents: total, installmentCents: [each, each, total - 2 * each] };
}
