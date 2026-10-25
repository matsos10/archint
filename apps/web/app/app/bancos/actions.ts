'use server';

import { redirect } from 'next/navigation';
import { defaultAggregator, startBankLink } from '@somar/core';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';

export async function connectBankAction(fd: FormData) {
  const ctx = await requireAccount();
  const agg = defaultAggregator();
  if (!agg) redirect('/app/bancos?erro=indisponivel');
  const institutionId = String(fd.get('institutionId') ?? '');
  const institutionName = String(fd.get('institutionName') ?? '');
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  const { link } = await startBankLink(getDb(), agg, { accountId: ctx.accountId, userId: ctx.userId }, { institutionId, institutionName, redirectUrl: `${base}/app/bancos/retorno` });
  redirect(link);
}
