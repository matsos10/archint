'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { endDelegation, enterClientAccount, registerPartner, respondDelegation, switchActiveAccount } from '@somar/core';
import { getDb } from '@/lib/db';
import { requestMeta, requireUser } from '@/lib/session';
import { toActionError, type ActionState } from '@/lib/action';

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40) || 'servico';

export async function savePartnerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser();
  try {
    const services = [0, 1, 2]
      .map((i) => ({ name: String(fd.get(`service${i}Name`) ?? '').trim(), price: String(fd.get(`service${i}Price`) ?? '').trim() }))
      .filter((x) => x.name)
      .map((x) => ({ code: slug(x.name), name: x.name, priceFromCents: Math.round(Number(x.price.replace(',', '.') || 0) * 100) }));
    await registerPartner(
      getDb(),
      s.user.id,
      {
        name: String(fd.get('name') ?? ''),
        firmName: String(fd.get('firmName') ?? ''),
        occNumber: String(fd.get('occNumber') ?? ''),
        email: String(fd.get('email') ?? ''),
        city: String(fd.get('city') ?? ''),
        bio: String(fd.get('bio') ?? ''),
        specialties: fd.getAll('specialties').map(String) as never,
        services,
      },
      await requestMeta(),
    );
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath('/contabilista');
  return { ok: true, message: 'Perfil guardado.' };
}

export async function respondAction(id: string, accept: boolean) {
  const s = await requireUser();
  try {
    await respondDelegation(getDb(), s.user.id, id, accept, await requestMeta());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath('/contabilista');
  return { ok: true };
}

export async function endAction(id: string) {
  const s = await requireUser();
  try {
    await endDelegation(getDb(), s.user.id, id, await requestMeta());
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath('/contabilista');
  return { ok: true };
}

/** Abre a conta do cliente (verifica a delegação e regista o acesso). */
export async function openClientAction(accountId: string) {
  const s = await requireUser();
  try {
    await enterClientAccount(getDb(), { sessionId: s.sessionId, userId: s.user.id }, accountId, await requestMeta());
  } catch (e) {
    return toActionError(e);
  }
  redirect('/app');
}

/** Volta a uma conta própria (titular/administrador/membro). */
export async function openOwnAccountAction(accountId: string) {
  const s = await requireUser();
  await switchActiveAccount(getDb(), s.sessionId, s.user.id, accountId);
  redirect('/app');
}
