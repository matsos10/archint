'use server';

import { revalidatePath } from 'next/cache';
import { defaultMailer, requestDelegation, revokeDelegation } from '@somar/core';
import { withTenant } from '@somar/db';
import { getDb } from '@/lib/db';
import { requestMeta, requireAccountAdmin } from '@/lib/session';
import { toActionError, type ActionState } from '@/lib/action';

export async function requestDelegationAction(partnerId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await requireAccountAdmin();
    await withTenant(getDb(), ctx, (tx) =>
      requestDelegation(tx, { mailer: defaultMailer(), appUrl: process.env.APP_URL }, ctx, {
        partnerId,
        scopes: fd.getAll('scopes').map(String),
        serviceCode: String(fd.get('serviceCode') ?? '') || null,
        message: String(fd.get('message') ?? ''),
      }),
    );
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath('/app/contabilistas');
  return { ok: true, message: 'Pedido enviado. Recebes uma notificação quando o contabilista responder.' };
}

export async function revokeDelegationAction(id: string, _: ActionState): Promise<ActionState> {
  try {
    const ctx = await requireAccountAdmin();
    await revokeDelegation(getDb(), ctx, id, await requestMeta(), { mailer: defaultMailer() });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath('/app/contabilistas');
  return { ok: true, message: 'Acesso terminado.' };
}
