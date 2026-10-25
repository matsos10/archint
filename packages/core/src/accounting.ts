import { and, eq, gte, inArray, isNotNull, isNull, lte, notInArray, or } from 'drizzle-orm';
import { accounts, categories, documentLines, invoices, receipts, transactions, type TenantTx } from '@somar/db';
import {
  computeSocialSecurity,
  computeVatYear,
  estimateIrc,
  estimateIrs,
  inferRateCode,
  quarterOf,
  roundCents,
  vatFromGross,
  vatRatePct,
  type IrsIncomeType,
  type IrsResult,
  type IrcResult,
  type SsQuarterIncome,
  type SsResult,
  type VatOperation,
  type VatPeriodResult,
  type VatRateCode,
} from '@somar/tax-engine';
import type { LoadedParams } from './tax';

/**
 * Liga os dados contabilísticos (faturas, movimentos, justificativos, categorias) ao motor fiscal.
 * É a única ponte entre a base de dados e os cálculos: o motor nunca lê a base de dados.
 */

export interface YearDataOptions {
  /** Rendimentos do ano anterior por trimestre (base das contribuições de janeiro a março). */
  previousYearQuarterIncomeCents?: Partial<Record<1 | 2 | 3 | 4, number>>;
  deductions?: Parameters<typeof estimateIrs>[0]['deductions'];
  /** Data de referência para o "até hoje" (por omissão: hoje). */
  asOf?: string;
}

export interface MonthPoint {
  month: string;
  incomeCents: number;
  expensesCents: number;
}

export interface YearData {
  year: number;
  incomeSource: 'invoices' | 'transactions';
  vatOperations: VatOperation[];
  vat: VatPeriodResult[];
  irs?: IrsResult;
  irc?: IrcResult;
  socialSecurity?: SsResult;
  summary: {
    incomeNetCents: number;
    expensesCents: number;
    vatPayableCents: number;
    socialSecurityCents: number;
    incomeTaxCents: number;
    incomeTaxResultCents: number;
    resultCents: number;
    efaturaExpensesCents: number;
    socialSecurityPaidCents: number;
    withholdingCents: number;
  };
  months: MonthPoint[];
  warnings: string[];
}

export async function buildYearData(tx: TenantTx, accountId: string, year: number, loaded: LoadedParams, opts: YearDataOptions = {}): Promise<YearData> {
  const params = loaded.resolve(year);
  const warnings: string[] = [];
  if (params.year !== year) warnings.push(`Sem parâmetros fiscais de ${year}: usados os de ${params.year}.`);
  const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId));
  if (!account) throw new Error('Conta não encontrada');
  const region = account.taxRegion;
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const individual = account.legalForm === 'trabalhador_independente' || account.legalForm === 'eni';
  const incomeType: IrsIncomeType = account.mainIncomeType ?? 'servicos_tabela_151';

  // ---------- Receitas: faturas emitidas (fonte preferencial) ----------
  const invs = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.accountId, accountId), inArray(invoices.status, ['issued', 'sent', 'partially_paid', 'paid']), gte(invoices.issueDate, `${year - 1}-07-01`), lte(invoices.issueDate, to)));
  const lines = invs.length
    ? await tx.select().from(documentLines).where(inArray(documentLines.invoiceId, invs.map((i) => i.id)))
    : [];
  const ops: VatOperation[] = [];
  const incomeByQuarter = new Map<string, number>();
  let withholding = 0;
  let incomeSource: YearData['incomeSource'] = 'invoices';
  for (const inv of invs) {
    const sign = inv.docType === 'NC' ? -1 : 1;
    const key = `${inv.issueDate.slice(0, 4)}-${quarterOf(Number(inv.issueDate.slice(5, 7)))}`;
    incomeByQuarter.set(key, (incomeByQuarter.get(key) ?? 0) + sign * inv.netCents);
    if (inv.issueDate < from) continue;
    withholding += sign * inv.withholdingCents;
    const invLines = lines.filter((l) => l.invoiceId === inv.id);
    const byRate = new Map<VatRateCode, { net: number; vat: number }>();
    for (const l of invLines.length ? invLines : [{ vatRateCode: 'normal' as VatRateCode, netCents: inv.netCents, vatCents: inv.vatCents }]) {
      const cur = byRate.get(l.vatRateCode) ?? { net: 0, vat: 0 };
      byRate.set(l.vatRateCode, { net: cur.net + l.netCents, vat: cur.vat + l.vatCents });
    }
    for (const [rateCode, v] of byRate) {
      ops.push({ ref: inv.number ?? inv.id, date: inv.issueDate, kind: 'output', netCents: sign * v.net, vatCents: sign * v.vat, rateCode });
    }
  }

  // ---------- Movimentos e justificativos ----------
  const rows = await tx
    .select({ t: transactions, c: categories, r: receipts })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(receipts, eq(receipts.transactionId, transactions.id))
    .where(and(eq(transactions.accountId, accountId), gte(transactions.bookingDate, from), lte(transactions.bookingDate, to), isNull(transactions.duplicateOfId), notInArray(transactions.status, ['ignored'])));

  // Sem faturas no ano: estima as receitas a partir dos recebimentos categorizados como receita.
  if (!ops.some((o) => o.kind === 'output')) {
    const incomeTx = rows.filter((x) => x.c?.kind === 'income');
    if (incomeTx.length) {
      incomeSource = 'transactions';
      warnings.push('Receitas estimadas a partir dos recebimentos bancários (sem faturas emitidas no Somar). Emite as faturas para valores exatos.');
      warnings.push('Sem faturas, as retenções na fonte feitas pelos clientes não são conhecidas: a estimativa de IRS pode estar acima do real.');
      const vatApplies = account.vatRegime === 'normal_mensal' || account.vatRegime === 'normal_trimestral';
      for (const { t } of incomeTx) {
        const rate = vatApplies ? vatRatePct('normal', region, params) : 0;
        const vat = vatFromGross(t.amountCents, rate);
        ops.push({ ref: t.id, date: t.bookingDate, kind: 'output', netCents: t.amountCents - vat, vatCents: vat, rateCode: vatApplies ? 'normal' : 'isenta' });
        const key = `${year}-${quarterOf(Number(t.bookingDate.slice(5, 7)))}`;
        incomeByQuarter.set(key, (incomeByQuarter.get(key) ?? 0) + t.amountCents - vat);
      }
    }
  }

  let efatura = 0;
  let aiPendingReceipts = 0;
  let expenses = 0;
  let ssPaid = 0;
  const monthly = new Map<string, MonthPoint>();
  const bump = (date: string, k: 'incomeCents' | 'expensesCents', v: number) => {
    const m = date.slice(0, 7);
    const p = monthly.get(m) ?? { month: m, incomeCents: 0, expensesCents: 0 };
    p[k] += v;
    monthly.set(m, p);
  };
  for (const o of ops) if (o.kind === 'output') bump(o.date, 'incomeCents', o.netCents);

  for (const { t, c, r } of rows) {
    if (c?.code === 'seguranca_social') ssPaid += -t.amountCents;
    if (c?.kind !== 'expense' || t.amountCents >= 0) continue;
    const gross = -t.amountCents;
    // Valores lidos pela IA só contam depois de confirmados pelo utilizador (a IA propõe, o utilizador confirma).
    const aiPending = !!r && (r.extracted as { source?: string } | null)?.source === 'ai' && r.status !== 'confirmed';
    if (aiPending) aiPendingReceipts++;
    const hasReceipt = !!r && !aiPending && r.totalCents != null && r.vatCents != null;
    const rate: VatRateCode =
      (hasReceipt ? inferRateCode(r!.totalCents! - r!.vatCents!, r!.vatCents!, region, params) : null) ?? c.defaultVatRate ?? 'normal';
    const vat = hasReceipt ? r!.vatCents! : rate === 'isenta' || rate === 'nao_sujeita' ? 0 : vatFromGross(gross, vatRatePct(rate, region, params));
    const net = (hasReceipt ? r!.totalCents! : gross) - vat;
    const deductiblePct = c.vatDeductiblePct ?? params.vat.deductibility[c.vatDeductionKey] ?? 100;
    const businessPct = t.businessPct ?? 100;
    if (vat > 0 || hasReceipt) {
      ops.push({
        ref: t.id,
        date: hasReceipt && r!.documentDate ? r!.documentDate : t.bookingDate,
        kind: 'input',
        netCents: net,
        vatCents: vat,
        rateCode: rate,
        deductiblePct,
        businessPct,
        hasValidInvoice: hasReceipt,
        bucket: c.vatBucket as VatOperation['bucket'],
      });
    }
    const vatDeductible = hasReceipt ? roundCents(vat * (deductiblePct / 100) * (businessPct / 100)) : 0;
    const cost = roundCents((gross - vatDeductible) * (businessPct / 100));
    expenses += cost;
    bump(t.bookingDate, 'expensesCents', cost);
    if (hasReceipt) efatura += roundCents((net + vat - vatDeductible) * (businessPct / 100));
  }

  // Justificativos confirmados sem movimento bancário (ex.: pagos em numerário)
  const cash = await tx
    .select()
    .from(receipts)
    .where(and(eq(receipts.accountId, accountId), isNull(receipts.transactionId), eq(receipts.status, 'confirmed'), isNotNull(receipts.totalCents), gte(receipts.documentDate, from), lte(receipts.documentDate, to)));
  for (const r of cash) {
    const vat = r.vatCents ?? 0;
    const net = r.totalCents! - vat;
    ops.push({ ref: r.id, date: r.documentDate!, kind: 'input', netCents: net, vatCents: vat, rateCode: inferRateCode(net, vat, region, params) ?? 'normal', hasValidInvoice: true });
    expenses += net;
    efatura += net;
    bump(r.documentDate!, 'expensesCents', net);
  }

  if (aiPendingReceipts) warnings.push(`${aiPendingReceipts} justificativo(s) lidos pela IA aguardam a tua confirmação: só contam para o IVA e o IRS depois de confirmados.`);

  // ---------- Motor fiscal ----------
  const vat = computeVatYear({ regime: account.vatRegime, year, operations: ops }, params);
  const vatPayable = vat.reduce((s, p) => s + p.payableCents, 0);
  const incomeNet = ops.filter((o) => o.kind === 'output').reduce((s, o) => s + o.netCents, 0);

  let irs: IrsResult | undefined;
  let irc: IrcResult | undefined;
  let ss: SsResult | undefined;
  if (individual) {
    irs = estimateIrs(
      {
        year,
        regime: account.incomeTaxRegime === 'irs_contabilidade_organizada' ? 'irs_contabilidade_organizada' : 'irs_simplificado',
        activityStartDate: account.activityStartDate,
        hasEmploymentIncome: account.hasEmploymentIncome,
        incomes: [{ type: incomeType, grossCents: incomeNet }],
        socialSecurityPaidCents: ssPaid,
        justifiedExpenses: { efaturaCents: efatura },
        deductibleExpensesCents: expenses + ssPaid,
        deductions: opts.deductions,
        withholdingCents: withholding,
      },
      params,
    );
    const quarters: SsQuarterIncome[] = [];
    for (const q of [3, 4] as const) {
      const v = opts.previousYearQuarterIncomeCents?.[q] ?? incomeByQuarter.get(`${year - 1}-${q}`);
      if (v != null) quarters.push({ year: year - 1, quarter: q, byType: { [incomeType]: v } });
    }
    for (const q of [1, 2, 3, 4] as const) quarters.push({ year, quarter: q, byType: { [incomeType]: incomeByQuarter.get(`${year}-${q}`) ?? 0 } });
    if (!quarters.some((q) => q.year === year - 1)) warnings.push('Sem rendimentos do 4.º trimestre do ano anterior: as contribuições de janeiro a março podem estar subestimadas.');
    ss = computeSocialSecurity({ legalForm: account.legalForm, activityStartDate: account.activityStartDate, quarters }, loaded.resolve);
  } else {
    irc = estimateIrc({ taxableProfitCents: incomeNet - expenses, isSme: true }, params);
  }

  const ssYear = ss?.byYear[year] ?? 0;
  const incomeTax = irs?.netTaxCents ?? irc?.totalCents ?? 0;
  return {
    year,
    incomeSource,
    vatOperations: ops,
    vat,
    irs,
    irc,
    socialSecurity: ss,
    summary: {
      incomeNetCents: incomeNet,
      expensesCents: expenses,
      vatPayableCents: vatPayable,
      socialSecurityCents: ssYear,
      incomeTaxCents: incomeTax,
      incomeTaxResultCents: irs?.resultCents ?? irc?.resultCents ?? 0,
      resultCents: incomeNet - expenses - ssYear - incomeTax,
      efaturaExpensesCents: efatura,
      socialSecurityPaidCents: ssPaid,
      withholdingCents: withholding,
    },
    months: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
    warnings: [
      ...warnings,
      ...(irs?.warnings ?? []),
      ...(() => {
        const n = vat.reduce((k, v) => k + v.input.excludedWithoutInvoice.length, 0);
        return n ? [`${n} despesa(s) com IVA sem justificativo: o IVA não é dedutível nem contam para o IRS.`] : [];
      })(),
    ],
  };
}

/** Contagens para o painel (por rever, sem justificativo, duplicados). */
export async function reviewCounts(tx: TenantTx, accountId: string) {
  const rows = await tx
    .select({ status: transactions.status, dup: transactions.duplicateOfId, cat: transactions.categoryId })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), or(eq(transactions.status, 'to_review'), isNotNull(transactions.duplicateOfId))));
  return {
    toReview: rows.filter((r) => r.status === 'to_review').length,
    uncategorized: rows.filter((r) => !r.cat).length,
    duplicates: rows.filter((r) => r.dup && r.status !== 'ignored').length,
  };
}
