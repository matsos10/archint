import { estimateIrs, type IrsInput, type IrsResult } from './irs';
import type { TaxParams } from './params';

export interface RegimeComparison {
  simplified: IrsResult;
  organized: IrsResult;
  /** Custo anual estimado de um contabilista certificado (obrigatório na contabilidade organizada). */
  accountantCostCents: number;
  /** Diferença (simplificado − organizada − custo do contabilista). Positivo = a organizada compensa. */
  savingsWithOrganizedCents: number;
  recommendation: 'irs_simplificado' | 'irs_contabilidade_organizada';
  simplifiedAllowed: boolean;
  explanation: string;
}

/**
 * Compara o IRS no regime simplificado e na contabilidade organizada (arts. 28.º, 31.º e 32.º CIRS).
 * A opção pela contabilidade organizada vigora por 3 anos (art. 28.º, n.º 4 CIRS) — a recomendação é indicativa.
 */
export function compareIrsRegimes(
  base: Omit<IrsInput, 'regime'>,
  opts: { deductibleExpensesCents: number; accountantCostCents: number },
  params: TaxParams,
): RegimeComparison {
  const simplified = estimateIrs({ ...base, regime: 'irs_simplificado' }, params);
  const organized = estimateIrs(
    { ...base, regime: 'irs_contabilidade_organizada', deductibleExpensesCents: opts.deductibleExpensesCents + opts.accountantCostCents },
    params,
  );
  const simplifiedAllowed = simplified.catB.grossCents <= params.irs.simplified.maxGrossCents;
  const savings = simplified.netTaxCents - organized.netTaxCents - opts.accountantCostCents;
  const recommendation = !simplifiedAllowed || savings > 0 ? 'irs_contabilidade_organizada' : 'irs_simplificado';
  const explanation = !simplifiedAllowed
    ? 'Os rendimentos ultrapassam o limite do regime simplificado: a contabilidade organizada é obrigatória.'
    : savings > 0
      ? `Com as tuas despesas, a contabilidade organizada poupa cerca de ${(savings / 100).toFixed(0)} € por ano, já descontado o custo do contabilista.`
      : `O regime simplificado é mais vantajoso (cerca de ${(-savings / 100).toFixed(0)} € por ano), já contando com o custo do contabilista.`;
  return { simplified, organized, accountantCostCents: opts.accountantCostCents, savingsWithOrganizedCents: savings, recommendation, simplifiedAllowed, explanation };
}
