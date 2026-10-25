import { and, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm';
import { categories, insights, invoices, payments, receipts, transactions, type TenantTx } from '@somar/db';
import { normalizeDescription } from './banking/normalize';
import { formatEurPlain } from './format';

/**
 * Deteção de possíveis duplicados: mesmo montante e descrição normalizada, datas a ≤ 2 dias.
 * O movimento mais recente (ou importado depois) fica marcado com duplicate_of_id e para revisão;
 * nunca é apagado — o utilizador confirma ou desfaz.
 */
export async function detectDuplicates(tx: TenantTx, accountId: string, transactionIds?: string[]): Promise<number> {
  const rows = await tx
    .select({ id: transactions.id, bookingDate: transactions.bookingDate, amountCents: transactions.amountCents, description: transactions.description, duplicateOfId: transactions.duplicateOfId, status: transactions.status, createdAt: transactions.createdAt, notes: transactions.notes })
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .orderBy(transactions.bookingDate, transactions.createdAt, transactions.id);
  const targets = transactionIds ? new Set(transactionIds) : null;
  const seen = new Map<string, { id: string; bookingDate: string }[]>();
  let n = 0;
  for (const r of rows) {
    const key = `${r.amountCents}|${normalizeDescription(r.description)}`;
    const prev = (seen.get(key) ?? []).filter((p) => Math.abs(Date.parse(r.bookingDate) - Date.parse(p.bookingDate)) <= 2 * 86_400_000);
    const notDuplicate = r.notes?.includes('[não duplicado]');
    if (prev.length && !r.duplicateOfId && !notDuplicate && (!targets || targets.has(r.id)) && r.status !== 'ignored') {
      await tx.update(transactions).set({ duplicateOfId: prev[0]!.id, status: 'to_review' }).where(eq(transactions.id, r.id));
      n++;
    }
    if (!r.duplicateOfId) seen.set(key, [...(seen.get(key) ?? []), { id: r.id, bookingDate: r.bookingDate }]);
  }
  return n;
}

/** Recalcula os alertas da conta (duplicados, justificativos em falta, recebimentos sem fatura, por categorizar). */
export async function refreshInsights(tx: TenantTx, accountId: string, today = new Date().toISOString().slice(0, 10)) {
  const keep: string[] = [];
  const upsert = async (v: {
    type: 'anomaly' | 'missing_document' | 'alert' | 'saving';
    code: string;
    severity: 'info' | 'warning' | 'critical';
    title: string;
    body?: string;
    entityType?: string;
    entityId?: string;
    data?: Record<string, unknown>;
    dedupeKey: string;
  }) => {
    keep.push(v.dedupeKey);
    await tx
      .insert(insights)
      .values({ accountId, ...v })
      .onConflictDoUpdate({ target: [insights.accountId, insights.dedupeKey], set: { title: v.title, body: v.body, data: v.data, severity: v.severity, updatedAt: new Date() } });
  };

  // 1) Possíveis duplicados por resolver
  const dups = await tx
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), isNotNull(transactions.duplicateOfId), notInArray(transactions.status, ['ignored'])));
  for (const d of dups) {
    await upsert({
      type: 'anomaly',
      code: 'duplicate_transaction',
      severity: 'warning',
      title: `Possível movimento duplicado: ${d.description}`,
      body: `Há dois movimentos de ${formatEurPlain(-d.amountCents)} com a mesma descrição em datas próximas. Confirma se é um duplicado.`,
      entityType: 'transaction',
      entityId: d.id,
      dedupeKey: `dup:${d.id}`,
    });
  }

  // 2) Despesas que exigem justificativo e não o têm (há mais de 5 dias)
  const cutoff = new Date(Date.parse(today) - 5 * 86_400_000).toISOString().slice(0, 10);
  const missing = await tx
    .select({ id: transactions.id, description: transactions.description, amountCents: transactions.amountCents, bookingDate: transactions.bookingDate })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(receipts, eq(receipts.transactionId, transactions.id))
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(categories.kind, 'expense'),
        eq(categories.requiresReceipt, true),
        isNull(receipts.id),
        isNull(transactions.duplicateOfId),
        notInArray(transactions.status, ['ignored']),
        sql`${transactions.bookingDate} <= ${cutoff}`,
      ),
    );
  for (const m of missing) {
    await upsert({
      type: 'missing_document',
      code: 'missing_receipt',
      severity: 'warning',
      title: `Falta o justificativo: ${m.description}`,
      body: `Sem fatura em teu nome (com o teu NIF), o IVA de ${formatEurPlain(-m.amountCents)} não pode ser deduzido e a despesa não conta para o IRS.`,
      entityType: 'transaction',
      entityId: m.id,
      dedupeKey: `receipt:${m.id}`,
    });
  }

  // 3) Recebimentos categorizados como receita sem fatura associada
  const unbilled = await tx
    .select({ id: transactions.id, description: transactions.description, amountCents: transactions.amountCents })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.accountId, accountId), eq(categories.kind, 'income'), isNull(transactions.invoiceId), isNull(transactions.duplicateOfId)));
  for (const u of unbilled) {
    await upsert({
      type: 'missing_document',
      code: 'missing_invoice',
      severity: 'critical',
      title: `Recebimento sem fatura: ${u.description}`,
      body: `Recebeste ${formatEurPlain(u.amountCents)}. Todas as prestações de serviços e vendas têm de ter fatura (art. 29.º CIVA).`,
      entityType: 'transaction',
      entityId: u.id,
      dedupeKey: `invoice:${u.id}`,
    });
  }

  // 4) Movimentos por categorizar
  const [{ n } = { n: 0 }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), isNull(transactions.categoryId), notInArray(transactions.status, ['ignored'])));
  if (n > 0) {
    await upsert({ type: 'alert', code: 'uncategorized', severity: 'info', title: `${n} movimento(s) por categorizar`, body: 'Categoriza-os para que as estimativas de impostos fiquem certas.', dedupeKey: 'uncategorized' });
  }

  // Resolve os alertas que deixaram de se aplicar
  await tx
    .update(insights)
    .set({ status: 'resolved' })
    .where(and(eq(insights.accountId, accountId), eq(insights.status, 'open'), keep.length ? notInArray(insights.dedupeKey, keep) : undefined));
  // Reabre os que voltaram a aplicar-se
  if (keep.length) {
    await tx.update(insights).set({ status: 'open' }).where(and(eq(insights.accountId, accountId), eq(insights.status, 'resolved'), inArray(insights.dedupeKey, keep)));
  }
  return keep.length;
}

/** Associa recebimentos a faturas emitidas em aberto (montante exato e nome do cliente na descrição). */
export async function matchIncomeToInvoices(tx: TenantTx, accountId: string, incomeCategoryId: string): Promise<number> {
  const open = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.accountId, accountId), inArray(invoices.status, ['issued', 'sent', 'partially_paid'])));
  if (!open.length) return 0;
  const credits = await tx
    .select()
    .from(transactions)
    .where(and(eq(transactions.accountId, accountId), isNull(transactions.invoiceId), sql`${transactions.amountCents} > 0`));
  let n = 0;
  const used = new Set<string>();
  for (const t of credits.sort((a, b) => a.bookingDate.localeCompare(b.bookingDate))) {
    const desc = normalizeDescription(t.description);
    const candidates = open.filter((i) => {
      if (used.has(i.id) || i.totalCents - i.paidCents !== t.amountCents || i.issueDate > t.bookingDate) return false;
      const num = normalizeDescription(i.number ?? '').replace(/\s/g, '');
      const name = normalizeDescription(String((i.clientSnapshot as { name?: string } | null)?.name ?? ''))
        .split(' ')
        .filter((w) => w.length > 3);
      return (num && desc.replace(/\s/g, '').includes(num)) || name.some((w) => desc.includes(w));
    });
    if (candidates.length !== 1) continue;
    const inv = candidates[0]!;
    used.add(inv.id);
    await tx.update(transactions).set({ invoiceId: inv.id, categoryId: incomeCategoryId, categorySource: 'system', categoryConfidence: 0.99, status: 'reconciled' }).where(eq(transactions.id, t.id));
    await tx.insert(payments).values({ accountId, invoiceId: inv.id, amountCents: t.amountCents, paidOn: t.bookingDate, method: 'transferencia', transactionId: t.id });
    const paid = inv.paidCents + t.amountCents;
    await tx
      .update(invoices)
      .set({ paidCents: paid, status: paid >= inv.totalCents ? 'paid' : 'partially_paid', paidAt: paid >= inv.totalCents ? new Date(t.bookingDate) : null })
      .where(eq(invoices.id, inv.id));
    n++;
  }
  return n;
}
