'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { bankAccounts, transactions, withTenant } from '@somar/db';
import { aiCategorizePending, audit, confirmAiCategory, correctCategory, importTransactions, parseStatement, refreshInsights } from '@somar/core';
import { accountLlm } from '@/lib/ai';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { toActionError, type ActionState } from '@/lib/action';

export async function setCategoryAction(transactionId: string, categoryId: string) {
  const ctx = await requireAccount();
  const r = await withTenant(getDb(), ctx.accountId, async (tx) => {
    const [cur] = await tx.select({ source: transactions.categorySource }).from(transactions).where(and(eq(transactions.id, transactionId), eq(transactions.accountId, ctx.accountId)));
    if (cur?.source === 'ai') {
      // Confirmação/correção de uma sugestão da IA: regista a decisão no registo de IA.
      await confirmAiCategory(tx, ctx, transactionId, categoryId);
      await refreshInsights(tx, ctx.accountId);
      return { learnedPattern: null, propagated: 0 };
    }
    const res = await correctCategory(tx, ctx.accountId, transactionId, categoryId);
    await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'transaction.categorized', entityType: 'transaction', entityId: transactionId, data: { categoryId, learned: res.learnedPattern } });
    await refreshInsights(tx, ctx.accountId);
    return res;
  });
  revalidatePath('/app/transacoes');
  return r;
}

/** Resolve um possível duplicado: "ignore" exclui o movimento; "keep" confirma que não é duplicado. */
export async function resolveDuplicateAction(transactionId: string, decision: 'ignore' | 'keep') {
  const ctx = await requireAccount();
  await withTenant(getDb(), ctx.accountId, async (tx) => {
    const [t] = await tx.select().from(transactions).where(and(eq(transactions.id, transactionId), eq(transactions.accountId, ctx.accountId)));
    if (!t) return;
    if (decision === 'ignore') await tx.update(transactions).set({ status: 'ignored' }).where(eq(transactions.id, t.id));
    else
      await tx
        .update(transactions)
        .set({ duplicateOfId: null, status: t.categoryId ? 'categorized' : 'to_review', notes: [t.notes, '[não duplicado]'].filter(Boolean).join(' ') })
        .where(eq(transactions.id, t.id));
    await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: `transaction.duplicate_${decision}`, entityType: 'transaction', entityId: t.id });
    await refreshInsights(tx, ctx.accountId);
  });
  revalidatePath('/app/transacoes');
  revalidatePath('/app');
}

export async function setBusinessPctAction(transactionId: string, pct: number) {
  const ctx = await requireAccount();
  const value = Math.max(0, Math.min(100, Math.round(pct)));
  await withTenant(getDb(), ctx.accountId, (tx) =>
    tx.update(transactions).set({ businessPct: value }).where(and(eq(transactions.id, transactionId), eq(transactions.accountId, ctx.accountId))),
  );
  revalidatePath('/app/transacoes');
}

export interface ImportState extends ActionState {
  result?: { imported: number; skipped: number; duplicates: number; categorized: number; receiptsMatched: number; warnings: string[] };
}

export async function importStatementAction(_: ImportState, fd: FormData): Promise<ImportState> {
  const ctx = await requireAccount();
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Escolhe o ficheiro do extrato (CSV ou OFX).' };
  if (file.size > 5 * 1024 * 1024) return { error: 'O ficheiro tem mais de 5 MB.' };
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    // Alguns bancos exportam em Windows-1252/Latin-1: se não for UTF-8 válido, descodifica como latin1.
    let text = buf.toString('utf8');
    if (text.includes('�')) text = buf.toString('latin1');
    const parsed = parseStatement(file.name, text);
    if (parsed.rows.length === 0) return { error: parsed.warnings[0] ?? 'Não foram encontrados movimentos no ficheiro.' };
    const result = await withTenant(getDb(), ctx.accountId, async (tx) => {
      let bankId = String(fd.get('bankAccountId') ?? '');
      if (!bankId || bankId === 'new') {
        const name = String(fd.get('bankName') ?? '').trim() || 'Conta bancária';
        const [b] = await tx.insert(bankAccounts).values({ accountId: ctx.accountId, source: parsed.format, name: name.slice(0, 200) }).returning();
        bankId = b!.id;
      }
      return importTransactions(tx, { accountId: ctx.accountId, userId: ctx.userId }, bankId, parsed.rows, { source: parsed.format });
    });
    revalidatePath('/app', 'layout');
    return { ok: true, result: { ...result, warnings: parsed.warnings.slice(0, 5) } };
  } catch (e) {
    return toActionError(e);
  }
}

export async function aiSuggestCategoriesAction(): Promise<{ applied: number; status: string }> {
  const ctx = await requireAccount();
  const r = await withTenant(getDb(), ctx.accountId, async (tx) => aiCategorizePending(tx, ctx, await accountLlm(tx, ctx.accountId)));
  revalidatePath('/app/transacoes');
  return r;
}

export async function confirmAiAction(transactionId: string) {
  const ctx = await requireAccount();
  await withTenant(getDb(), ctx.accountId, async (tx) => {
    await confirmAiCategory(tx, ctx, transactionId);
    await refreshInsights(tx, ctx.accountId);
  });
  revalidatePath('/app/transacoes');
}
