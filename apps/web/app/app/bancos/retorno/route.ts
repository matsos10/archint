import { NextResponse, type NextRequest } from 'next/server';
import { completeBankLink, defaultAggregator } from '@somar/core';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';

/** Regresso do agregador depois de o utilizador autorizar o acesso no banco. */
export async function GET(req: NextRequest) {
  const ctx = await requireAccount();
  const connectionId = req.nextUrl.searchParams.get('connection') ?? '';
  const agg = defaultAggregator();
  const url = new URL('/app/bancos', req.nextUrl.origin);
  if (!agg || !/^[0-9a-f-]{36}$/.test(connectionId)) {
    url.searchParams.set('erro', 'ligacao');
    return NextResponse.redirect(url);
  }
  try {
    const r = await completeBankLink(getDb(), agg, { accountId: ctx.accountId, userId: ctx.userId }, connectionId);
    url.searchParams.set(r.status === 'linked' ? 'ok' : 'erro', r.status === 'linked' ? String(r.accounts) : r.status);
  } catch {
    url.searchParams.set('erro', 'ligacao');
  }
  return NextResponse.redirect(url);
}
