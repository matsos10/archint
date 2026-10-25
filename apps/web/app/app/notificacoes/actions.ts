'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { notifications, withTenant } from '@somar/db';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';

export async function markAllReadAction() {
  const ctx = await requireAccount();
  await withTenant(getDb(), ctx.accountId, (tx) =>
    tx.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.accountId, ctx.accountId), isNull(notifications.readAt))),
  );
  revalidatePath('/app', 'layout');
}
