'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createTaxParamDraft, publishTaxParamSet } from '@somar/core';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { toActionError, type ActionState } from '@/lib/action';

async function requireAdmin() {
  const s = await requireUser();
  if (!s.user.isPlatformAdmin) throw new Error('forbidden');
  return s;
}

export async function createDraftAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  let id: string;
  try {
    let json: unknown;
    try {
      json = JSON.parse(String(fd.get('params') ?? ''));
    } catch {
      return { error: 'JSON inválido.' };
    }
    const row = await createTaxParamDraft(getDb(), s.user.id, { params: json, notes: String(fd.get('notes') ?? '') || undefined });
    id = row.id;
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath('/admin/parametros');
  redirect(`/admin/parametros/${id}`);
}

export async function publishAction(id: string) {
  const s = await requireAdmin();
  await publishTaxParamSet(getDb(), s.user.id, id);
  revalidatePath('/admin/parametros');
  revalidatePath(`/admin/parametros/${id}`);
}
