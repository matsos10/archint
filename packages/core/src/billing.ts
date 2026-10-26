import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { accounts, memberships, notifications, plans, stripeEvents, subscriptions, users, withTenant, type Db, type TenantTx } from '@somar/db';
import { audit } from './audit';
import { AppError } from './errors';

/**
 * Planos e subscrições com o Stripe.
 *
 * - O pagamento é feito no Stripe Checkout e gerido no Customer Portal: dados de cartão nunca passam
 *   pelos servidores do Somar (só identificadores de cliente/subscrição).
 * - O estado da subscrição vem exclusivamente dos webhooks assinados (fonte de verdade), nunca do
 *   redirecionamento de sucesso do browser.
 * - Funcionalidades e quotas dependem do "plano efetivo": subscrição ativa, em período de teste ou
 *   com pagamento em atraso (período de tolerância) → plano pago; caso contrário → gratuito.
 */

export const FREE_PLAN = 'gratuito';

export const FEATURES = {
  contabilidade: 'Contabilidade, despesas e justificativos',
  faturacao: 'Faturas e orçamentos certificados',
  banco_automatico: 'Sincronização automática com o banco (open banking)',
  lembretes_automaticos: 'Lembretes automáticos de cobrança',
  declaracoes: 'Preparação das declarações (IVA, IRS, Segurança Social)',
  sociedades: 'Apoio à IES e ao Modelo 22 (sociedades)',
  suporte_prioritario: 'Suporte prioritário',
} as const;
export type Feature = keyof typeof FEATURES;

const PAID_STATUSES = ['active', 'trialing', 'past_due'] as const;

export interface EffectivePlan {
  code: string;
  name: string;
  features: string[];
  aiMonthlyQuota: number;
  status: string;
  paid: boolean;
  billingInterval: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  hasStripeCustomer: boolean;
}

type Exec = Db | TenantTx;

/** Plano efetivo da conta (funciona em transação de tenant ou com a ligação de plataforma). */
export async function effectivePlan(exec: Exec, accountId: string): Promise<EffectivePlan> {
  const [row] = await exec
    .select({ plan: plans, sub: subscriptions })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.accountId, accountId));
  const paidActive = row && row.plan.code !== FREE_PLAN && (PAID_STATUSES as readonly string[]).includes(row.sub.status);
  let plan = row?.plan;
  if (!plan || (!paidActive && plan.code !== FREE_PLAN)) {
    [plan] = await exec.select().from(plans).where(eq(plans.code, FREE_PLAN));
  }
  return {
    code: plan?.code ?? FREE_PLAN,
    name: plan?.name ?? 'Gratuito',
    features: plan?.features ?? [],
    aiMonthlyQuota: plan?.aiMonthlyQuota ?? 30,
    status: row?.sub.status ?? 'active',
    paid: !!paidActive,
    billingInterval: row?.sub.billingInterval ?? null,
    currentPeriodEnd: row?.sub.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: row?.sub.cancelAtPeriodEnd ?? false,
    hasStripeCustomer: !!row?.sub.stripeCustomerId,
  };
}

export async function hasFeature(exec: Exec, accountId: string, feature: Feature) {
  return (await effectivePlan(exec, accountId)).features.includes(feature);
}

export async function assertFeature(exec: Exec, accountId: string, feature: Feature) {
  if (!(await hasFeature(exec, accountId, feature))) {
    throw new AppError('plan_required', `Disponível nos planos pagos: ${FEATURES[feature]}. Vê os planos em Definições › Plano.`, 402);
  }
}

// ---------------------------------------------------------------------------
// Cliente Stripe (API REST, form-encoded). Injetável para testes.
// ---------------------------------------------------------------------------

type Fetch = typeof fetch;

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items: { data: { price: { id: string; recurring?: { interval?: string } | null }; current_period_end?: number }[] };
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

function form(params: Record<string, unknown>, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export class StripeClient {
  constructor(
    private readonly secretKey: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async call<T>(method: 'GET' | 'POST', path: string, params?: Record<string, unknown>, idempotencyKey?: string): Promise<T> {
    const body = params && method === 'POST' ? form(params).toString() : undefined;
    const res = await this.fetchImpl(`https://api.stripe.com/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        'content-type': 'application/x-www-form-urlencoded',
        ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
      },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) throw new AppError('billing_unavailable', `Pagamentos indisponíveis: ${data.error?.message ?? res.status}`, 502);
    return data;
  }

  createCustomer(p: { email?: string | null; name: string; accountId: string }) {
    return this.call<{ id: string }>('POST', '/customers', { email: p.email ?? undefined, name: p.name, metadata: { account_id: p.accountId } }, `customer-${p.accountId}`);
  }

  createCheckoutSession(p: { customer: string; price: string; accountId: string; successUrl: string; cancelUrl: string; automaticTax?: boolean }) {
    return this.call<{ id: string; url: string }>('POST', '/checkout/sessions', {
      mode: 'subscription',
      customer: p.customer,
      client_reference_id: p.accountId,
      line_items: { 0: { price: p.price, quantity: 1 } },
      success_url: p.successUrl,
      cancel_url: p.cancelUrl,
      locale: 'pt',
      allow_promotion_codes: 'true',
      tax_id_collection: { enabled: 'true' },
      customer_update: { name: 'auto', address: 'auto' },
      automatic_tax: p.automaticTax ? { enabled: 'true' } : undefined,
      metadata: { account_id: p.accountId },
      subscription_data: { metadata: { account_id: p.accountId } },
    });
  }

  createPortalSession(p: { customer: string; returnUrl: string }) {
    return this.call<{ url: string }>('POST', '/billing_portal/sessions', { customer: p.customer, return_url: p.returnUrl });
  }

  retrieveSubscription(id: string) {
    return this.call<StripeSubscription>('GET', `/subscriptions/${encodeURIComponent(id)}`);
  }
}

let stripe: StripeClient | null | undefined;
export function defaultStripeClient(): StripeClient | null {
  if (stripe === undefined) stripe = process.env.STRIPE_SECRET_KEY ? new StripeClient(process.env.STRIPE_SECRET_KEY) : null;
  return stripe;
}
export function setDefaultStripeClient(c: StripeClient | null) {
  stripe = c;
}

/**
 * Verifica a assinatura `Stripe-Signature` (HMAC-SHA256 de "<t>.<corpo>") com tolerância temporal,
 * para impedir eventos forjados e repetições antigas.
 */
export function verifyStripeSignature(payload: string, header: string | null | undefined, secret: string, opts: { toleranceSec?: number; now?: number } = {}): StripeEvent {
  if (!header) throw new AppError('bad_signature', 'Assinatura em falta.', 400);
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!Number.isFinite(t) || !signatures.length) throw new AppError('bad_signature', 'Assinatura inválida.', 400);
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(now - t) > (opts.toleranceSec ?? 300)) throw new AppError('bad_signature', 'Assinatura expirada.', 400);
  const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex'));
  const ok = signatures.some((s) => {
    const b = Buffer.from(s);
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
  if (!ok) throw new AppError('bad_signature', 'Assinatura inválida.', 400);
  return JSON.parse(payload) as StripeEvent;
}

/** Gera um cabeçalho de assinatura (testes e ferramentas locais). */
export function signStripePayload(payload: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
}

// ---------------------------------------------------------------------------
// Checkout e portal
// ---------------------------------------------------------------------------

async function requireBillingAdmin(db: Db, ctx: { accountId: string; userId: string }) {
  const [m] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.accountId, ctx.accountId), eq(memberships.userId, ctx.userId)));
  if (!m || (m.role !== 'owner' && m.role !== 'admin')) throw new AppError('forbidden', 'Só o titular ou um administrador da conta pode gerir o plano.', 403);
}

/** Inicia o Stripe Checkout para um plano pago; devolve o URL alojado pelo Stripe. */
export async function startCheckout(
  db: Db,
  client: StripeClient | null,
  ctx: { accountId: string; userId: string },
  input: { planCode: string; interval: 'month' | 'year'; appUrl: string },
) {
  if (!client) throw new AppError('billing_unavailable', 'Os pagamentos ainda não estão configurados neste servidor.', 503);
  await requireBillingAdmin(db, ctx);
  const [plan] = await db.select().from(plans).where(and(eq(plans.code, input.planCode), eq(plans.active, true)));
  const price = input.interval === 'year' ? plan?.stripePriceYearlyId : plan?.stripePriceMonthlyId;
  if (!plan || plan.code === FREE_PLAN || !price) throw new AppError('invalid_plan', 'Plano indisponível.', 400);
  const current = await effectivePlan(db, ctx.accountId);
  if (current.paid) throw new AppError('already_subscribed', 'Já tens um plano pago: muda de plano ou de periodicidade no portal de faturação.', 409);

  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.accountId, ctx.accountId));
  let customer = sub?.stripeCustomerId;
  if (!customer) {
    const [a] = await db.select({ name: accounts.name, email: accounts.email }).from(accounts).where(eq(accounts.id, ctx.accountId));
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, ctx.userId));
    customer = (await client.createCustomer({ name: a!.name, email: a!.email ?? u?.email, accountId: ctx.accountId })).id;
    await db.update(subscriptions).set({ stripeCustomerId: customer, updatedAt: new Date() }).where(eq(subscriptions.accountId, ctx.accountId));
  }
  const session = await client.createCheckoutSession({
    customer,
    price,
    accountId: ctx.accountId,
    successUrl: `${input.appUrl}/app/plano?checkout=sucesso`,
    cancelUrl: `${input.appUrl}/app/plano?checkout=cancelado`,
    automaticTax: process.env.STRIPE_AUTOMATIC_TAX === '1',
  });
  await audit(db, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'billing.checkout_started', entityType: 'plan', data: { plan: plan.code, interval: input.interval } });
  return session.url;
}

/** Portal de faturação do Stripe (mudar de plano, cartão, faturas, cancelar). */
export async function openBillingPortal(db: Db, client: StripeClient | null, ctx: { accountId: string; userId: string }, appUrl: string) {
  if (!client) throw new AppError('billing_unavailable', 'Os pagamentos ainda não estão configurados neste servidor.', 503);
  await requireBillingAdmin(db, ctx);
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.accountId, ctx.accountId));
  if (!sub?.stripeCustomerId) throw new AppError('no_customer', 'Ainda não tens uma subscrição paga.', 400);
  return (await client.createPortalSession({ customer: sub.stripeCustomerId, returnUrl: `${appUrl}/app/plano` })).url;
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

function mapStatus(s: string): 'trialing' | 'active' | 'past_due' | 'canceled' | 'incomplete' {
  if (s === 'trialing' || s === 'active' || s === 'past_due' || s === 'canceled' || s === 'incomplete') return s;
  if (s === 'unpaid' || s === 'paused') return 'past_due';
  return 'canceled'; // incomplete_expired e desconhecidos
}

async function accountForCustomer(db: Db, customer: string | undefined, metadataAccount?: string) {
  // 1.º pelo cliente Stripe já associado; 2.º pelo account_id que o Somar pôs nos metadados do
  // checkout, só se essa conta ainda não tiver cliente associado (os eventos são assinados).
  if (customer) {
    const [s] = await db.select({ accountId: subscriptions.accountId }).from(subscriptions).where(eq(subscriptions.stripeCustomerId, customer));
    if (s) return s.accountId;
  }
  if (metadataAccount && /^[0-9a-f-]{36}$/i.test(metadataAccount)) {
    const [s] = await db
      .select({ accountId: subscriptions.accountId })
      .from(subscriptions)
      .where(and(eq(subscriptions.accountId, metadataAccount), isNull(subscriptions.stripeCustomerId)));
    if (s) return s.accountId;
  }
  return null;
}

async function applySubscription(db: Db, sub: StripeSubscription, deleted = false) {
  const accountId = await accountForCustomer(db, sub.customer, sub.metadata?.account_id);
  if (!accountId) return null;
  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id;
  const [paidPlan] = priceId
    ? await db.select().from(plans).where(or(eq(plans.stripePriceMonthlyId, priceId), eq(plans.stripePriceYearlyId, priceId)))
    : [];
  const [free] = await db.select().from(plans).where(eq(plans.code, FREE_PLAN));
  const status = deleted ? 'canceled' : mapStatus(sub.status);
  const ended = deleted || status === 'canceled';
  const plan = ended || !paidPlan ? free! : paidPlan;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;
  const [before] = await db.select({ planId: subscriptions.planId, status: subscriptions.status }).from(subscriptions).where(eq(subscriptions.accountId, accountId));
  await db
    .update(subscriptions)
    .set({
      planId: plan.id,
      status: ended ? 'active' : status, // fim da subscrição paga → volta ao gratuito (ativo)
      stripeCustomerId: sub.customer,
      stripeSubscriptionId: ended ? null : sub.id,
      billingInterval: ended ? null : (item?.price?.recurring?.interval ?? null),
      currentPeriodEnd: !ended && periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: !ended && !!sub.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.accountId, accountId));
  if (before?.planId !== plan.id || before?.status !== status) {
    await audit(db, { accountId, actorType: 'system', action: ended ? 'billing.subscription_ended' : 'billing.subscription_updated', entityType: 'subscription', data: { plan: plan.code, status } });
  }
  return accountId;
}

async function notifyBillingAdmins(db: Db, accountId: string, title: string, body: string) {
  const admins = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.accountId, accountId), inArray(memberships.role, ['owner', 'admin'])));
  await withTenant(db, accountId, async (tx) => {
    for (const a of admins) await tx.insert(notifications).values({ accountId, userId: a.userId, type: 'billing', title, body, link: '/app/plano' });
  });
}

/**
 * Processa um evento de webhook já verificado. Idempotente: cada evento é aplicado uma única vez.
 * Corre com a ligação de plataforma (o evento não tem sessão de utilizador).
 */
export async function handleStripeEvent(db: Db, client: StripeClient | null, event: StripeEvent): Promise<{ processed: boolean; accountId: string | null }> {
  const inserted = await db.insert(stripeEvents).values({ id: event.id, type: event.type }).onConflictDoNothing().returning({ id: stripeEvents.id });
  if (!inserted.length) return { processed: false, accountId: null };
  const obj = event.data.object;
  let accountId: string | null = null;
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const customer = obj.customer as string | undefined;
        const ref = (obj.client_reference_id as string | undefined) ?? (obj.metadata as Record<string, string> | undefined)?.account_id;
        accountId = await accountForCustomer(db, customer, ref);
        const subId = obj.subscription as string | undefined;
        if (accountId && subId && client) accountId = await applySubscription(db, await client.retrieveSubscription(subId));
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        accountId = await applySubscription(db, obj as unknown as StripeSubscription);
        break;
      case 'customer.subscription.deleted':
        accountId = await applySubscription(db, obj as unknown as StripeSubscription, true);
        if (accountId) await notifyBillingAdmins(db, accountId, 'O teu plano pago terminou', 'A conta passou para o plano Gratuito. Os teus dados mantêm-se.');
        break;
      case 'invoice.payment_failed': {
        accountId = await accountForCustomer(db, obj.customer as string | undefined);
        if (accountId) {
          await db.update(subscriptions).set({ status: 'past_due', updatedAt: new Date() }).where(eq(subscriptions.accountId, accountId));
          await notifyBillingAdmins(db, accountId, 'Pagamento do plano falhou', 'Atualiza o meio de pagamento no portal de faturação para manteres o plano.');
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // Permite que o Stripe volte a enviar o evento.
    await db.delete(stripeEvents).where(eq(stripeEvents.id, event.id));
    throw e;
  }
  if (accountId) await db.update(stripeEvents).set({ accountId }).where(eq(stripeEvents.id, event.id));
  return { processed: true, accountId };
}
