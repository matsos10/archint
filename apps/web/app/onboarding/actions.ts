'use server';

import { redirect } from 'next/navigation';
import { createAccount, type AccountProfileInput } from '@somar/core';
import { getDb } from '@/lib/db';
import { requestMeta, requireUser } from '@/lib/session';
import { toActionError, type ActionState } from '@/lib/action';

export async function createAccountAction(input: AccountProfileInput): Promise<ActionState> {
  const session = await requireUser();
  try {
    await createAccount(getDb(), session.user.id, input, { sessionId: session.sessionId, ip: (await requestMeta()).ip });
  } catch (e) {
    return toActionError(e);
  }
  redirect('/app');
}
