'use server';

import { redirect } from 'next/navigation';
import { completeTwoFactor, signIn, signOut, signUp } from '@somar/core';
import { getDb } from '@/lib/db';
import { clearSessionCookie, requestMeta, sessionToken, setSessionCookie } from '@/lib/session';
import { toActionError, type ActionState } from '@/lib/action';

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '');

export async function signUpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (str(fd, 'terms') !== 'on') return { error: 'Tens de aceitar os termos e a política de privacidade.' };
  try {
    const r = await signUp(getDb(), { email: str(fd, 'email'), password: str(fd, 'password'), name: str(fd, 'name') }, await requestMeta());
    await setSessionCookie(r.token, r.expiresAt);
  } catch (e) {
    return toActionError(e);
  }
  redirect('/onboarding');
}

export async function signInAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let next: string;
  try {
    const r = await signIn(getDb(), { email: str(fd, 'email'), password: str(fd, 'password') }, await requestMeta());
    await setSessionCookie(r.token, r.expiresAt);
    next = r.status === 'two_factor_required' ? '/entrar/2fa' : '/app';
  } catch (e) {
    return toActionError(e);
  }
  redirect(next);
}

export async function twoFactorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const token = await sessionToken();
  if (!token) redirect('/entrar');
  try {
    const r = await completeTwoFactor(getDb(), token, str(fd, 'code'), await requestMeta());
    await setSessionCookie(r.token, r.expiresAt);
  } catch (e) {
    return toActionError(e);
  }
  redirect('/app');
}

export async function signOutAction() {
  const token = await sessionToken();
  if (token) await signOut(getDb(), token);
  await clearSessionCookie();
  redirect('/entrar');
}
