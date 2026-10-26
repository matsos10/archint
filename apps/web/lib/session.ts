import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppError, getMembership, getPartnerForUser, resolveAccountantAccess, validateSession, type DelegationScope, type RequestMeta, type ValidSession } from '@somar/core';
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
  /** Transações com o papel só de leitura do Postgres (contabilista sem o âmbito da operação). */
  readOnly: boolean;
  /** Âmbitos da delegação (só para contabilistas). */
  scopes: DelegationScope[] | null;
}

/**
 * Exige uma conta ativa de que o utilizador é membro; senão, envia para o onboarding (ou para o
 * portal, se for contabilista). Um contabilista só entra com uma delegação aceite e válida, e por
 * omissão em modo de consulta.
 */
export const requireAccount = cache(async (): Promise<AccountContext> => {
  const session = await requireUser();
  const db = getDb();
  const fallback = async () => redirect((await getPartnerForUser(db, session.user.id)) ? '/contabilista' : '/onboarding');
  if (!session.activeAccountId) return fallback();
  const membership = await getMembership(db, session.user.id, session.activeAccountId);
  if (!membership) return fallback();
  const base = { session, accountId: session.activeAccountId, userId: session.user.id, role: membership.role };
  if (membership.role === 'accountant') {
    const access = await resolveAccountantAccess(db, session.user.id, session.activeAccountId);
    if (!access) redirect('/contabilista');
    return { ...base, readOnly: true, scopes: access.scopes };
  }
  return { ...base, readOnly: false, scopes: null };
});

/** Para ações de escrita que um contabilista pode fazer se a delegação incluir o âmbito. */
export async function requireAccountFor(scope: Exclude<DelegationScope, 'read'>): Promise<AccountContext> {
  const ctx = await requireAccount();
  if (ctx.role !== 'accountant') return ctx;
  if (!ctx.scopes?.includes(scope)) throw new AppError('forbidden', 'O teu acesso de contabilista não inclui esta operação.', 403);
  return { ...ctx, readOnly: false };
}

/** Exige o titular ou um administrador da conta (planos, acessos de contabilistas). */
export async function requireAccountAdmin(): Promise<AccountContext> {
  const ctx = await requireAccount();
  if (ctx.role !== 'owner' && ctx.role !== 'admin') throw new AppError('forbidden', 'Só o titular ou um administrador da conta pode fazer isto.', 403);
  return ctx;
}

/** Como `requireAccountFor`, mas devolve o erro (para server actions que devolvem estado). */
export async function tryAccountFor(scope: Exclude<DelegationScope, 'read'>): Promise<AccountContext | { error: string }> {
  try {
    return await requireAccountFor(scope);
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
}
