'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { taxObligations, withTenant } from '@somar/db';
import { audit } from '@somar/core';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';

const ALLOWED = new Set(['upcoming', 'submitted', 'paid']);

/** O utilizador confirma que cumpriu (ou desfaz) uma obrigação. A app nunca submete nada sozinha. */
export async function setObligationStatus(id: string, status: string) {
  const ctx = await requireAccount();
  if (!ALLOWED.has(status)) return { error: 'Estado inválido.' };
  await withTenant(getDb(), ctx.accountId, async (tx) => {
    const [row] = await tx
      .update(taxObligations)
      .set({ status: status as 'upcoming', completedAt: status === 'upcoming' ? null : new Date() })
      .where(and(eq(taxObligations.id, id), eq(taxObligations.accountId, ctx.accountId)))
      .returning({ id: taxObligations.id, type: taxObligations.type });
    if (row) {
      await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'obligation.status_changed', entityType: 'tax_obligation', entityId: id, data: { status } });
    }
  });
  revalidatePath('/app/impostos');
  return { ok: true };
}
