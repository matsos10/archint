import { and, eq, isNull } from 'drizzle-orm';
import { bankAccounts, categories, transactions, type TenantTx } from '@somar/db';
import { audit } from '../audit';
import { applyRules } from '../categorize';
import { AppError } from '../errors';
import { detectDuplicates, matchIncomeToInvoices, refreshInsights } from '../insights';
import { autoMatchReceipts } from '../receipts';
import { normalizeDescription, transactionFingerprint } from './normalize';
import type { ParsedTransaction } from './parsers';

export interface ImportResult {
  imported: number;
  skipped: number;
  categorized: number;
  duplicates: number;
  invoicesMatched: number;
  receiptsMatched: number;
}

/**
 * Importa movimentos para uma conta bancária: deduplica (ids externos e impressões digitais),
 * categoriza por regras, associa recebimentos a faturas e justificativos a despesas, deteta
 * duplicados e atualiza os alertas. Idempotente: reimportar o mesmo extrato não cria nada novo.
 */
export async function importTransactions(
  tx: TenantTx,
  ctx: { accountId: string; userId?: string | null },
  bankAccountId: string,
  rows: ParsedTransaction[],
  opts: { source?: 'csv' | 'ofx' | 'open_banking' | 'manual' } = {},
): Promise<ImportResult> {
  const [bank] = await tx.select().from(bankAccounts).where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.accountId, ctx.accountId)));
  if (!bank) throw new AppError('not_found', 'Conta bancária não encontrada.', 404);

  const existing = await tx
    .select({ fingerprint: transactions.fingerprint, externalId: transactions.externalId })
    .from(transactions)
    .where(eq(transactions.bankAccountId, bankAccountId));
  const fps = new Set(existing.map((e) => e.fingerprint));
  const ext = new Set(existing.map((e) => e.externalId).filter(Boolean));

  const occurrences = new Map<string, number>();
  const toInsert: (typeof transactions.$inferInsert)[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (r.externalId && ext.has(r.externalId)) {
      skipped++;
      continue;
    }
    const key = `${r.bookingDate}|${r.amountCents}|${normalizeDescription(r.description)}`;
    const occ = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occ);
    const fingerprint = transactionFingerprint(r, occ);
    if (fps.has(fingerprint)) {
      skipped++;
      continue;
    }
    fps.add(fingerprint);
    toInsert.push({
      accountId: ctx.accountId,
      bankAccountId,
      bookingDate: r.bookingDate,
      valueDate: r.valueDate,
      amountCents: r.amountCents,
      currency: r.currency ?? bank.currency,
      description: r.description.slice(0, 2000),
      counterparty: r.counterparty?.slice(0, 200),
      externalId: r.externalId,
      fingerprint,
    });
  }
  const inserted = toInsert.length
    ? await tx.insert(transactions).values(toInsert).returning({ id: transactions.id })
    : [];
  const ids = inserted.map((i) => i.id);

  const last = rows.filter((r) => r.balanceCents != null).at(-1);
  if (last?.balanceCents != null) {
    await tx.update(bankAccounts).set({ balanceCents: last.balanceCents, balanceAt: new Date(last.bookingDate) }).where(eq(bankAccounts.id, bankAccountId));
  }

  const duplicates = ids.length ? await detectDuplicates(tx, ctx.accountId, ids) : 0;
  const [income] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(and(isNull(categories.accountId), eq(categories.code, 'receita_servicos')));
  const invoicesMatched = income ? await matchIncomeToInvoices(tx, ctx.accountId, income.id) : 0;
  const categorized = ids.length ? await applyRules(tx, ctx.accountId, { transactionIds: ids }) : 0;
  const receiptsMatched = await autoMatchReceipts(tx, ctx.accountId);
  await refreshInsights(tx, ctx.accountId);

  await audit(tx, {
    accountId: ctx.accountId,
    actorUserId: ctx.userId,
    actorType: ctx.userId ? 'user' : 'system',
    action: 'transactions.imported',
    entityType: 'bank_account',
    entityId: bankAccountId,
    data: { source: opts.source ?? bank.source, imported: ids.length, skipped, duplicates },
  });
  return { imported: ids.length, skipped, categorized: categorized + invoicesMatched, duplicates, invoicesMatched, receiptsMatched };
}
