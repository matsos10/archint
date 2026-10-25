import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getMembership, validateSession, type RequestMeta, type ValidSession } from '@somar/core';
import { getDb } from './db';

export const SESSION_COOKIE = 'somar_session';

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  return { ip, userAgent: h.get('user-agent') };
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Sessão atual (memoizada por pedido). */
export const getSession = cache(async (): Promise<ValidSession | null> => {
  const token = await sessionToken();
  if (!token) return null;
  return validateSession(getDb(), token);
});

/** Exige sessão totalmente autenticada (incluindo 2FA, quando ativo). */
export async function requireUser(): Promise<ValidSession> {
  const s = await getSession();
  if (!s) redirect('/entrar');
  if (!s.twoFactorVerified) redirect('/entrar/2fa');
  return s;
}

export interface AccountContext {
  session: ValidSession;
  accountId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member' | 'accountant';
}

/** Exige uma conta ativa de que o utilizador é membro; senão, envia para o onboarding. */
export const requireAccount = cache(async (): Promise<AccountContext> => {
  const session = await requireUser();
  if (!session.activeAccountId) redirect('/onboarding');
  const membership = await getMembership(getDb(), session.user.id, session.activeAccountId);
  if (!membership) redirect('/onboarding');
  return { session, accountId: session.activeAccountId, userId: session.user.id, role: membership.role };
});
