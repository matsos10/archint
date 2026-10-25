import { withholdingFor } from './irs';
import { roundCents } from './money';
import type { TaxParams } from './params';
import type { IrsIncomeType, TaxRegion, VatRateCode, VatRegime } from './types';
import { vatRatePct } from './vat';

/**
 * Cálculo e validação de documentos de faturação (art. 36.º CIVA; DL 28/2019).
 * O IVA é apurado por taxa sobre a soma das bases das linhas (arredondado ao cêntimo por taxa).
 */

/** Motivos de isenção (tabela da AT, campo TaxExemptionCode do SAF-T). */
export const VAT_EXEMPTION_REASONS: Record<string, string> = {
  M01: 'Artigo 16.º, n.º 6 do CIVA',
  M02: 'Artigo 6.º do Decreto-Lei n.º 198/90, de 19 de junho',
  M04: 'Isento artigo 13.º do CIVA',
  M05: 'Isento artigo 14.º do CIVA',
  M06: 'Isento artigo 15.º do CIVA',
  M07: 'Isento artigo 9.º do CIVA',
  M09: 'IVA – não confere direito a dedução',
  M10: 'IVA – regime de isenção (artigo 53.º do CIVA)',
  M16: 'Isento artigo 14.º do RITI',
  M19: 'Outras isenções',
  M20: 'IVA – regime forfetário',
  M21: 'IVA – não confere direito à dedução (ou expressão similar)',
  M30: 'IVA – autoliquidação (artigo 2.º, n.º 1, alínea i) do CIVA)',
  M40: 'IVA – autoliquidação (artigo 6.º, n.º 6, alínea a) do CIVA, a contrario)',
  M41: 'IVA – autoliquidação (artigo 8.º, n.º 3 do RITI)',
  M43: 'IVA – autoliquidação (Decreto-Lei n.º 362/99)',
  M99: 'Não sujeito ou não tributado',
};

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
  discountPct?: number;
  vatRateCode: VatRateCode;
  vatExemptionCode?: string | null;
}

export interface InvoiceLineResult extends InvoiceLineInput {
  vatRatePct: number;
  netCents: number;
  vatCents: number;
}

export interface InvoiceTotals {
  lines: InvoiceLineResult[];
  byRate: { rateCode: VatRateCode; ratePct: number; baseCents: number; vatCents: number; exemptionCode?: string | null }[];
  netCents: number;
  vatCents: number;
  withholdingCents: number;
  withholdingRate: number;
  totalCents: number;
}

export interface InvoiceContext {
  region: TaxRegion;
  vatRegime: VatRegime;
  incomeType?: IrsIncomeType | null;
  /** Prestador é pessoa singular (cat. B) — só então há retenção na fonte de IRS. */
  providerIsIndividual: boolean;
  providerWithholdingExempt: boolean;
  clientHasOrganizedAccounting: boolean;
  /** Força (true) ou impede (false) a retenção; omisso = regra legal. */
  applyWithholding?: boolean;
}

export function computeInvoice(lines: InvoiceLineInput[], ctx: InvoiceContext, params: TaxParams): InvoiceTotals {
  const exempt = ctx.vatRegime === 'isento_art53' || ctx.vatRegime === 'isento_art9';
  const exemptCode = ctx.vatRegime === 'isento_art53' ? 'M10' : 'M07';
  const out: InvoiceLineResult[] = lines.map((l) => {
    const rateCode: VatRateCode = exempt ? 'isenta' : l.vatRateCode;
    const ratePct = vatRatePct(rateCode, ctx.region, params);
    const gross = l.quantity * l.unitPriceCents;
    const netCents = roundCents(gross * (1 - (l.discountPct ?? 0) / 100));
    return {
      ...l,
      vatRateCode: rateCode,
      vatExemptionCode: exempt ? exemptCode : ratePct === 0 ? (l.vatExemptionCode ?? null) : null,
      vatRatePct: ratePct,
      netCents,
      vatCents: 0,
    };
  });
  const groups = new Map<string, InvoiceTotals['byRate'][number]>();
  for (const l of out) {
    const key = `${l.vatRateCode}|${l.vatExemptionCode ?? ''}`;
    const g = groups.get(key) ?? { rateCode: l.vatRateCode, ratePct: l.vatRatePct, baseCents: 0, vatCents: 0, exemptionCode: l.vatExemptionCode };
    g.baseCents += l.netCents;
    groups.set(key, g);
  }
  for (const g of groups.values()) g.vatCents = roundCents((g.baseCents * g.ratePct) / 100);
  // Reparte o IVA do grupo pelas linhas (a última linha absorve o arredondamento).
  for (const g of groups.values()) {
    const ls = out.filter((l) => l.vatRateCode === g.rateCode && (l.vatExemptionCode ?? null) === (g.exemptionCode ?? null));
    let acc = 0;
    ls.forEach((l, i) => {
      l.vatCents = i === ls.length - 1 ? g.vatCents - acc : roundCents((l.netCents * g.ratePct) / 100);
      acc += l.vatCents;
    });
  }
  const net = out.reduce((s, l) => s + l.netCents, 0);
  const vat = [...groups.values()].reduce((s, g) => s + g.vatCents, 0);

  let wh = { rate: 0, withholdingCents: 0 };
  if (ctx.providerIsIndividual && ctx.applyWithholding !== false && ctx.incomeType) {
    const r = withholdingFor(
      { netCents: net, incomeType: ctx.incomeType, clientHasOrganizedAccounting: ctx.applyWithholding === true || ctx.clientHasOrganizedAccounting, providerExempt: ctx.providerWithholdingExempt && ctx.applyWithholding !== true },
      params,
    );
    wh = { rate: r.rate, withholdingCents: r.withholdingCents };
  }
  return {
    lines: out,
    byRate: [...groups.values()],
    netCents: net,
    vatCents: vat,
    withholdingCents: wh.withholdingCents,
    withholdingRate: wh.rate,
    totalCents: net + vat - wh.withholdingCents,
  };
}

export interface InvoiceValidationInput {
  docType: 'FT' | 'FR' | 'FS' | 'NC' | 'ND' | 'RC';
  issueDate: string;
  lastIssueDateInSeries?: string | null;
  issuer: { name?: string | null; nif?: string | null; addressLine?: string | null; postalCode?: string | null; city?: string | null };
  client: { name?: string | null; nif?: string | null; isCompany?: boolean; country?: string | null };
  totals: InvoiceTotals;
  relatedInvoiceNumber?: string | null;
  /** Venda de bens a retalho (limite da fatura simplificada de 1 000 € em vez de 100 €). */
  isRetailSale?: boolean;
  today: string;
}

/** Valida os elementos obrigatórios antes da emissão (art. 36.º, n.º 5 CIVA e regras de numeração). */
export function validateInvoice(v: InvoiceValidationInput): string[] {
  const e: string[] = [];
  if (!v.issuer.nif) e.push('Falta o teu NIF nas definições.');
  if (!v.issuer.name) e.push('Falta o teu nome ou denominação.');
  if (!v.issuer.addressLine || !v.issuer.postalCode || !v.issuer.city) e.push('Falta a tua morada completa nas definições.');
  if (!v.client.name && v.docType !== 'FS') e.push('Indica o cliente.');
  if (v.client.isCompany && !v.client.nif && (v.client.country ?? 'PT') === 'PT') e.push('O NIF do cliente empresa é obrigatório.');
  if (!v.totals.lines.length) e.push('A fatura tem de ter pelo menos uma linha.');
  v.totals.lines.forEach((l, i) => {
    if (!l.description.trim()) e.push(`Linha ${i + 1}: falta a descrição.`);
    if (!(l.quantity > 0)) e.push(`Linha ${i + 1}: quantidade inválida.`);
    if (l.unitPriceCents < 0) e.push(`Linha ${i + 1}: preço negativo (usa uma nota de crédito).`);
    if (l.vatRatePct === 0 && !l.vatExemptionCode) e.push(`Linha ${i + 1}: indica o motivo de isenção de IVA.`);
    if (l.vatExemptionCode && !VAT_EXEMPTION_REASONS[l.vatExemptionCode]) e.push(`Linha ${i + 1}: motivo de isenção desconhecido.`);
  });
  if (v.totals.totalCents <= 0 && v.docType !== 'NC') e.push('O total tem de ser positivo.');
  if (v.issueDate > v.today) e.push('A data de emissão não pode ser futura.');
  if (v.lastIssueDateInSeries && v.issueDate < v.lastIssueDateInSeries) {
    e.push('A data não pode ser anterior à do último documento emitido nesta série.');
  }
  // Art. 40.º CIVA: 1 000 € para vendas de retalhistas a particulares; 100 € nos restantes casos.
  if (v.docType === 'FS' && v.totals.totalCents > (v.isRetailSale ? 100_000 : 10_000)) {
    e.push(v.isRetailSale ? 'A fatura simplificada só é permitida até 1 000 €.' : 'A fatura simplificada só é permitida até 100 € em prestações de serviços. Emite uma fatura.');
  }
  if (v.docType === 'NC' && !v.relatedInvoiceNumber) e.push('A nota de crédito tem de indicar a fatura que retifica.');
  return e;
}

/** ATCUD = código de validação da série + "-" + número sequencial (Portaria 195/2020). */
export function buildAtcud(validationCode: string, sequence: number): string {
  return `${validationCode}-${sequence}`;
}
