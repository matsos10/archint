'use server';

import QRCode from 'qrcode';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { accounts, withTenant } from '@somar/db';
import { beginTotpEnrollment, confirmTotpEnrollment, disableTotp, updateAccountProfile } from '@somar/core';
import { getDb } from '@/lib/db';
import { requestMeta, requireAccount, requireUser } from '@/lib/session';
import { toActionError, type ActionState } from '@/lib/action';

export async function beginTotpAction(): Promise<{ uri?: string; secret?: string; qr?: string; error?: string }> {
  const s = await requireUser();
  try {
    const { uri, secret } = await beginTotpEnrollment(getDb(), s.user.id);
    return { uri, secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function confirmTotpAction(code: string): Promise<{ recoveryCodes?: string[]; error?: string }> {
  const s = await requireUser();
  try {
    const r = await confirmTotpEnrollment(getDb(), s.user.id, code, await requestMeta());
    revalidatePath('/app/definicoes');
    return r;
  } catch (e) {
    return toActionError(e);
  }
}

export async function disableTotpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  try {
    await disableTotp(getDb(), s.user.id, String(fd.get('password') ?? ''), await requestMeta());
    revalidatePath('/app/definicoes');
    return { ok: true, message: 'Autenticação de dois fatores desativada.' };
  } catch (e) {
    return toActionError(e);
  }
}

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAccount();
  if (ctx.role !== 'owner' && ctx.role !== 'admin') return { error: 'Só o titular pode alterar estes dados.' };
  try {
    const current = await withTenant(getDb(), ctx.accountId, async (tx) => {
      const [a] = await tx.select().from(accounts).where(eq(accounts.id, ctx.accountId));
      return a!;
    });
    const get = (k: string) => {
      const v = fd.get(k);
      return v == null ? undefined : String(v);
    };
    await updateAccountProfile(getDb(), ctx, {
      name: get('name') ?? current.name,
      legalForm: current.legalForm,
      nif: get('nif'),
      vatRegime: (get('vatRegime') ?? current.vatRegime) as typeof current.vatRegime,
      incomeTaxRegime: (get('incomeTaxRegime') ?? current.incomeTaxRegime) as typeof current.incomeTaxRegime,
      taxRegion: current.taxRegion,
      activityStartDate: get('activityStartDate') ?? current.activityStartDate,
      cae: get('cae'),
      cirsActivityCode: get('cirsActivityCode'),
      mainIncomeType: current.mainIncomeType ?? undefined,
      hasEmploymentIncome: fd.get('hasEmploymentIncome') === 'on',
      addressLine: get('addressLine'),
      postalCode: get('postalCode'),
      city: get('city'),
      email: get('email'),
    });
    revalidatePath('/app', 'layout');
    return { ok: true, message: 'Dados guardados.' };
  } catch (e) {
    return toActionError(e);
  }
}
