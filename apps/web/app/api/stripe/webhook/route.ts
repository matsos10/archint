import { NextResponse } from 'next/server';
import { defaultStripeClient, handleStripeEvent, isAppError, verifyStripeSignature } from '@somar/core';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Webhook do Stripe: só eventos com assinatura válida alteram subscrições (idempotente). */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const payload = await req.text();
  let event;
  try {
    event = verifyStripeSignature(payload, req.headers.get('stripe-signature'), secret);
  } catch (e) {
    return NextResponse.json({ error: isAppError(e) ? e.code : 'bad_request' }, { status: 400 });
  }
  try {
    const r = await handleStripeEvent(getDb(), defaultStripeClient(), event);
    return NextResponse.json({ received: true, duplicate: !r.processed });
  } catch (e) {
    console.error('[stripe] webhook', event.type, e);
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
}
