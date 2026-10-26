'use server';

import { revalidatePath } from 'next/cache';
import { setPartnerVerified } from '@somar/core';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/session';

export async function setVerifiedAction(partnerId: string, verified: boolean) {
  const s = await requireUser();
  if (!s.user.isPlatformAdmin) throw new Error('forbidden');
  await setPartnerVerified(getDb(), s.user.id, partnerId, verified);
  revalidatePath('/admin/contabilistas');
}
