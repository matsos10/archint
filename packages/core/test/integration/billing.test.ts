import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { notifications, plans, subscriptions, withTenant, type DbHandle } from '@somar/db';
import {
  StripeClient,
  aiUsageThisMonth,
  assertFeature,
  effectivePlan,
  handleStripeEvent,
  hasFeature,
  openBillingPortal,
  signStripePayload,
  startCheckout,
  verifyStripeSignature,
  type StripeSubscription,
} from '../../src';
import { freshDb, makeUserWithAccount } from './helpers';

let h: DbHandle;
afterAll(async () => h?.close());

const SECRET = 'whsec_test';

function fakeStripe(sub: () => StripeSubscription) {
  const calls: { method: string; path: string; body: URLSearchParams }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname.replace('/v1', '');
    calls.push({ method: init.method!, path, body: new URLSearchParams(String(init.body ?? '')) });
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (path === '/customers') return json({ id: 'cus_1' });
    if (path === '/checkout/sessions') return json({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' });
    if (path === '/billing_portal/sessions') return json({ url: 'https://billing.stripe.com/p/session/1' });
    if (path.startsWith('/subscriptions/')) return json(sub());
    return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 });
  }) as unknown as typeof fetch;
  return { client: new StripeClient('sk_test_x', fetchImpl), calls };
}

const subscription = (o: Partial<StripeSubscription> = {}): StripeSubscription => ({
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
  cancel_at_period_end: false,
  items: { data: [{ price: { id: 'price_plus_m', recurring: { interval: 'month' } }, current_period_end: 1_800_000_000 }] },
  ...o,
});

async function deliver(client: StripeClient | null, type: string, object: unknown, id = `evt_${Math.random()}`) {
  const body = JSON.stringify({ id, type, data: { object } });
  const event = verifyStripeSignature(body, signStripePayload(body, SECRET), SECRET);
  return handleStripeEvent(h.db, client, event);
}

describe('planos e Stripe', () => {
  let a: Awaited<ReturnType<typeof makeUserWithAccount>>;
  beforeEach(async () => {
    h = await freshDb();
    a = await makeUserWithAccount(h, 'Ana');
    await h.db.update(plans).set({ stripePriceMonthlyId: 'price_plus_m', stripePriceYearlyId: 'price_plus_y' }).where(eq(plans.code, 'plus'));
  });

  it('as contas novas ficam no plano gratuito, com funcionalidades e quota de IA do plano', async () => {
    const p = await effectivePlan(h.db, a.accountId);
    expect(p).toMatchObject({ code: 'gratuito', paid: false, aiMonthlyQuota: 30 });
    expect(await hasFeature(h.db, a.accountId, 'faturacao')).toBe(true);
    await expect(assertFeature(h.db, a.accountId, 'declaracoes')).rejects.toThrow(/planos pagos/);
  });

  it('checkout no Stripe: cliente criado uma vez, sessão ligada à conta, sem dados de cartão no Somar', async () => {
    const { client, calls } = fakeStripe(() => subscription());
    await expect(startCheckout(h.db, null, a, { planCode: 'plus', interval: 'month', appUrl: 'https://somar.pt' })).rejects.toThrow(/não estão configurados/);
    await expect(startCheckout(h.db, client, a, { planCode: 'gratuito', interval: 'month', appUrl: 'https://somar.pt' })).rejects.toThrow(/indisponível/);
    const url = await startCheckout(h.db, client, a, { planCode: 'plus', interval: 'month', appUrl: 'https://somar.pt' });
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(calls.map((c) => c.path)).toEqual(['/customers', '/checkout/sessions']);
    const s = calls[1]!.body;
    expect(Object.fromEntries(s)).toMatchObject({
      mode: 'subscription',
      customer: 'cus_1',
      client_reference_id: a.accountId,
      'line_items[0][price]': 'price_plus_m',
      'subscription_data[metadata][account_id]': a.accountId,
      success_url: 'https://somar.pt/app/plano?checkout=sucesso',
    });
    expect([...s.keys()].some((k) => /card|cvc/i.test(k))).toBe(false);
    await startCheckout(h.db, client, a, { planCode: 'plus', interval: 'year', appUrl: 'https://somar.pt' });
    expect(calls.filter((c) => c.path === '/customers')).toHaveLength(1);
    expect(calls.at(-1)!.body.get('line_items[0][price]')).toBe('price_plus_y');
    expect(await openBillingPortal(h.db, client, a, 'https://somar.pt')).toMatch(/billing\.stripe\.com/);
  });

  it('webhooks assinados ativam, mantêm em tolerância e terminam o plano; são idempotentes', async () => {
    const { client } = fakeStripe(() => subscription());
    await startCheckout(h.db, client, a, { planCode: 'plus', interval: 'month', appUrl: 'https://somar.pt' });
    expect((await effectivePlan(h.db, a.accountId)).paid).toBe(false); // o redirecionamento não ativa nada

    const done = await deliver(client, 'checkout.session.completed', { customer: 'cus_1', client_reference_id: a.accountId, subscription: 'sub_1' }, 'evt_1');
    expect(done).toEqual({ processed: true, accountId: a.accountId });
    expect(await deliver(client, 'checkout.session.completed', { customer: 'cus_1', subscription: 'sub_1' }, 'evt_1')).toEqual({ processed: false, accountId: null });
    let p = await effectivePlan(h.db, a.accountId);
    expect(p).toMatchObject({ code: 'plus', paid: true, aiMonthlyQuota: 300, billingInterval: 'month' });
    expect(p.currentPeriodEnd?.toISOString()).toBe(new Date(1_800_000_000 * 1000).toISOString());
    await assertFeature(h.db, a.accountId, 'declaracoes');
    expect((await withTenant(h.db, a.accountId, (tx) => aiUsageThisMonth(tx, a.accountId))).quota).toBe(300);

    await deliver(client, 'invoice.payment_failed', { customer: 'cus_1' });
    p = await effectivePlan(h.db, a.accountId);
    expect(p).toMatchObject({ status: 'past_due', paid: true }); // período de tolerância
    await deliver(client, 'customer.subscription.updated', subscription({ status: 'active', cancel_at_period_end: true }));
    expect(await effectivePlan(h.db, a.accountId)).toMatchObject({ status: 'active', cancelAtPeriodEnd: true });

    await deliver(client, 'customer.subscription.deleted', subscription({ status: 'canceled' }));
    p = await effectivePlan(h.db, a.accountId);
    expect(p).toMatchObject({ code: 'gratuito', paid: false, aiMonthlyQuota: 30 });
    expect(await hasFeature(h.db, a.accountId, 'declaracoes')).toBe(false);
    const [sub] = await h.db.select().from(subscriptions).where(eq(subscriptions.accountId, a.accountId));
    expect(sub).toMatchObject({ stripeCustomerId: 'cus_1', stripeSubscriptionId: null });
    const titles = (await withTenant(h.db, a.accountId, (tx) => tx.select().from(notifications))).map((n) => n.title);
    expect(titles).toEqual(expect.arrayContaining(['Pagamento do plano falhou', 'O teu plano pago terminou']));
  });

  it('rejeita assinaturas inválidas ou antigas e eventos de clientes desconhecidos', async () => {
    const body = JSON.stringify({ id: 'evt_x', type: 'customer.subscription.updated', data: { object: subscription() } });
    expect(() => verifyStripeSignature(body, signStripePayload(body, 'outro_segredo'), SECRET)).toThrow(/inválida/);
    expect(() => verifyStripeSignature(body, signStripePayload(body, SECRET, Math.floor(Date.now() / 1000) - 3600), SECRET)).toThrow(/expirada/);
    expect(() => verifyStripeSignature(body.replace('sub_1', 'sub_2'), signStripePayload(body, SECRET), SECRET)).toThrow(/inválida/);
    expect(() => verifyStripeSignature(body, null, SECRET)).toThrow(/falta/);
    // Cliente Stripe desconhecido e conta já associada a outro cliente: ignorado.
    await h.db.update(subscriptions).set({ stripeCustomerId: 'cus_1' }).where(eq(subscriptions.accountId, a.accountId));
    const r = await deliver(null, 'customer.subscription.updated', subscription({ customer: 'cus_intruso', metadata: { account_id: a.accountId } }));
    expect(r.accountId).toBeNull();
    expect((await effectivePlan(h.db, a.accountId)).paid).toBe(false);
  });
});
