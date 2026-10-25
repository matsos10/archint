import { roundCents } from './money';
import { legalRef, type TaxParams } from './params';
import type { Step } from './types';

export interface IrcInput {
  /** Lucro tributável (matéria coletável antes de prejuízos reportáveis). */
  taxableProfitCents: number;
  /** PME (DL 372/2007): taxa reduzida nos primeiros 50 000 € (art. 87.º, n.º 2 CIRC). */
  isSme: boolean;
  /** Taxa da derrama municipal do município da sede (até 1,5%). */
  municipalSurchargeRate?: number;
  paymentsOnAccountCents?: number;
  withholdingCents?: number;
}

export interface IrcResult {
  collectableCents: number;
  ircCents: number;
  municipalSurchargeCents: number;
  stateSurchargeCents: number;
  totalCents: number;
  resultCents: number;
  steps: Step[];
  warnings: string[];
}

/**
 * Estimativa de IRC (arts. 87.º, 87.º-A CIRC e Lei das Finanças Locais). Não inclui tributações autónomas
 * (art. 88.º), benefícios fiscais nem prejuízos fiscais — o contabilista certificado faz o apuramento final.
 */
export function estimateIrc(input: IrcInput, params: TaxParams): IrcResult {
  const p = params.irc;
  const steps: Step[] = [];
  const base = Math.max(0, input.taxableProfitCents);
  const smePortion = input.isSme ? Math.min(base, p.smeLimitCents) : 0;
  const general = base - smePortion;
  const irc = roundCents(smePortion * p.smeRate + general * p.rate);
  if (smePortion) steps.push({ code: 'irc.sme', label: `Taxa PME de ${p.smeRate * 100}% até ${p.smeLimitCents / 100} €`, amountCents: roundCents(smePortion * p.smeRate), legalRef: 'Art. 87.º, n.º 2 CIRC' });
  steps.push({ code: 'irc.general', label: `Taxa geral de ${p.rate * 100}%`, amountCents: roundCents(general * p.rate), legalRef: legalRef(params, 'irc') || 'Art. 87.º, n.º 1 CIRC' });

  const municipal = roundCents(base * (input.municipalSurchargeRate ?? p.municipalSurchargeRate));
  steps.push({ code: 'irc.derrama', label: 'Derrama municipal', amountCents: municipal, legalRef: 'Art. 18.º Lei 73/2013' });
  let state = 0;
  for (const s of p.stateSurcharge) {
    const top = s.toCents ?? Infinity;
    if (base > s.fromCents) state += (Math.min(base, top) - s.fromCents) * s.rate;
  }
  state = roundCents(state);
  if (state) steps.push({ code: 'irc.derrama_estadual', label: 'Derrama estadual', amountCents: state, legalRef: 'Art. 87.º-A CIRC' });
  const total = irc + municipal + state;
  const result = total - (input.paymentsOnAccountCents ?? 0) - (input.withholdingCents ?? 0);
  return {
    collectableCents: base,
    ircCents: irc,
    municipalSurchargeCents: municipal,
    stateSurchargeCents: state,
    totalCents: total,
    resultCents: result,
    steps,
    warnings: ['Estimativa sem tributações autónomas, benefícios fiscais nem dedução de prejuízos.'],
  };
}
