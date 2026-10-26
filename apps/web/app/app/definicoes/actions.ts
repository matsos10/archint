'use server';

import QRCode from 'qrcode';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { accounts, files, withTenant } from '@somar/db';
import { AppError, audit, beginTotpEnrollment, setAccountAiEnabled, confirmTotpEnrollment, defaultStorage, disableTotp, encryptString, fileChecksum, storageKeyFor, updateAccountProfile } from '@somar/core';
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
    const current = await withTenant(getDb(), ctx, async (tx) => {
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

export async function updateBrandingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireAccount();
  if (ctx.role !== 'owner' && ctx.role !== 'admin') return { error: 'Só o titular pode alterar estes dados.' };
  const color = String(fd.get('brandColor') ?? '');
  const iban = String(fd.get('iban') ?? '').replace(/\s/g, '').toUpperCase();
  if (color && !/^#[0-9a-f]{6}$/i.test(color)) return { error: 'Cor inválida.' };
  if (iban && !isValidIban(iban)) return { error: 'IBAN inválido.' };
  const logo = fd.get('logo');
  try {
    await withTenant(getDb(), ctx, async (tx) => {
      let logoFileId: string | undefined;
      if (logo instanceof File && logo.size > 0) {
        if (!['image/png', 'image/jpeg'].includes(logo.type)) throw new AppError('invalid_file', 'O logótipo tem de ser PNG ou JPG.');
        if (logo.size > 1024 * 1024) throw new AppError('file_too_large', 'O logótipo tem de ter menos de 1 MB.');
        const data = Buffer.from(await logo.arrayBuffer());
        const key = storageKeyFor(ctx.accountId, 'logo', logo.type === 'image/png' ? 'png' : 'jpg');
        await defaultStorage().put(key, data);
        const [f] = await tx.insert(files).values({ accountId: ctx.accountId, kind: 'logo', storageKey: key, originalName: logo.name.slice(0, 300), mimeType: logo.type, sizeBytes: data.length, sha256: fileChecksum(data), uploadedBy: ctx.userId }).returning({ id: files.id });
        logoFileId = f!.id;
      }
      await tx
        .update(accounts)
        .set({
          brandColor: color || null,
          iban: iban ? encryptString(iban, undefined, 'iban') : null,
          withholdingExempt: fd.get('withholdingExempt') === 'on',
          ...(logoFileId ? { logoFileId } : {}),
        })
        .where(eq(accounts.id, ctx.accountId));
      await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'account.branding_updated' });
    });
    revalidatePath('/app/definicoes');
    return { ok: true, message: 'Personalização guardada.' };
  } catch (e) {
    return toActionError(e);
  }
}

/** Validação do IBAN (ISO 13616, módulo 97). */
function isValidIban(iban: string) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const r = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let mod = 0;
  for (const d of r) mod = (mod * 10 + Number(d)) % 97;
  return mod === 1;
}

export async function setAiEnabledAction(enabled: boolean): Promise<ActionState> {
  const ctx = await requireAccount();
  try {
    await withTenant(getDb(), ctx, (tx) => setAccountAiEnabled(tx, { accountId: ctx.accountId, userId: ctx.session.user.id }, enabled));
    revalidatePath('/app', 'layout');
    return { ok: true, message: enabled ? 'Funcionalidades de IA ativadas.' : 'Funcionalidades de IA desativadas.' };
  } catch (e) {
    return toActionError(e);
  }
}
