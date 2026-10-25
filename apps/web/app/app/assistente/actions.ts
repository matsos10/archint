'use server';

import { revalidatePath } from 'next/cache';
import { askAssistant, loadTaxParams } from '@somar/core';
import { withTenant } from '@somar/db';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { toActionError } from '@/lib/action';
import { accountLlm } from '@/lib/ai';

export async function askAssistantAction(input: { threadId?: string; question: string }): Promise<{ threadId?: string; answer?: string; followUps?: string[]; error?: string }> {
  const ctx = await requireAccount();
  try {
    const loaded = await loadTaxParams(getDb());
    const r = await withTenant(getDb(), ctx.accountId, async (tx) =>
      askAssistant(tx, { llm: await accountLlm(tx, ctx.accountId), loaded }, { accountId: ctx.accountId, userId: ctx.session.user.id }, input),
    );
    revalidatePath('/app/assistente');
    return { threadId: r.threadId, answer: r.answer, followUps: r.followUps };
  } catch (e) {
    return toActionError(e);
  }
}
