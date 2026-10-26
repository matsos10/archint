'use server';

import { redirect } from 'next/navigation';
import { defaultStripeClient, openBillingPortal, startCheckout } from '@somar/core';
import { getDb } from '@/lib/db';
import { requireAccountAdmin } from '@/lib/session';
import { toActionError, type ActionState } from '@/lib/action';

const appUrl = () => process.env.APP_URL ?? 'http://localhost:3000';

export async function checkoutAction(planCode: string, interval: 'month' | 'year', _: ActionState): Promise<ActionState> {
  let url: string;
  try {
    const ctx = await requireAccountAdmin();
    url = await startCheckout(getDb(), defaultStripeClient(), ctx, { planCode, interval, appUrl: appUrl() });
  } catch (e) {
    return toActionError(e);
  }
  redirect(url);
}

export async function portalAction(_: ActionState): Promise<ActionState> {
  let url: string;
  try {
    const ctx = await requireAccountAdmin();
    url = await openBillingPortal(getDb(), defaultStripeClient(), ctx, appUrl());
  } catch (e) {
    return toActionError(e);
  }
  redirect(url);
}
