import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { plans } from '@somar/db';
import { FEATURES, aiUsageThisMonth, defaultStripeClient, effectivePlan, type Feature } from '@somar/core';
import { withTenant } from '@somar/db';
import { PlanCards } from '@/components/billing/plan-cards';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { cn } from '@/lib/utils';
import { CheckoutButton, PortalButton } from './buttons';

export const metadata: Metadata = { title: 'Plano' };

const STATUS: Record<string, string> = { active: 'Ativo', trialing: 'Em período de teste', past_due: 'Pagamento em atraso', canceled: 'Cancelado', incomplete: 'Pagamento por concluir' };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ periodo?: string; checkout?: string; funcionalidade?: string }> }) {
  const q = await searchParams;
  const interval = q.periodo === 'anual' ? 'year' : 'month';
  const ctx = await requireAccount();
  const db = getDb();
  const [current, usage, list] = await Promise.all([
    effectivePlan(db, ctx.accountId),
    withTenant(db, ctx, (tx) => aiUsageThisMonth(tx, ctx.accountId)),
    db.select().from(plans).where(eq(plans.active, true)).orderBy(asc(plans.sortOrder)),
  ]);
  const canManage = ctx.role === 'owner' || ctx.role === 'admin';
  const stripeReady = !!defaultStripeClient();
  const feature = q.funcionalidade && q.funcionalidade in FEATURES ? FEATURES[q.funcionalidade as Feature] : null;

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Plano</h1>
        <p className="text-sm text-muted-foreground">Muda de plano quando quiseres. Os teus dados ficam sempre contigo.</p>
      </div>

      {q.checkout === 'sucesso' && <Alert variant="success">Pagamento recebido. O plano fica ativo assim que o Stripe confirmar (normalmente em segundos); atualiza a página.</Alert>}
      {q.checkout === 'cancelado' && <Alert>O pagamento foi cancelado. Nada foi cobrado.</Alert>}
      {feature && <Alert variant="info">«{feature}» está disponível nos planos pagos.</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>O teu plano: {current.name}</CardTitle>
          <CardDescription>
            {current.paid ? (
              <>
                {STATUS[current.status] ?? current.status}
                {current.billingInterval && ` · faturação ${current.billingInterval === 'year' ? 'anual' : 'mensal'}`}
                {current.currentPeriodEnd && ` · ${current.cancelAtPeriodEnd ? 'termina' : 'renova'} a ${current.currentPeriodEnd.toLocaleDateString('pt-PT')}`}
              </>
            ) : (
              'Plano gratuito, sem limite de tempo.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          {current.status === 'past_due' && <Alert variant="warning">O último pagamento falhou. Atualiza o cartão no portal de faturação para não perderes o plano.</Alert>}
          <p>
            IA este mês: <span className="tabular">{usage.used} / {usage.quota}</span> pedidos.
          </p>
          {canManage && current.hasStripeCustomer && stripeReady && <div><PortalButton /></div>}
          {!canManage && <p className="text-muted-foreground">Só o titular ou um administrador da conta pode mudar o plano.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <div className="flex gap-1 self-start rounded-xl bg-muted p-1 text-sm" role="group" aria-label="Periodicidade">
          {(['mensal', 'anual'] as const).map((p) => (
            <Link key={p} href={`/app/plano?periodo=${p}`} aria-current={(p === 'anual') === (interval === 'year') ? 'true' : undefined} className={cn('rounded-lg px-3 py-1.5', (p === 'anual') === (interval === 'year') ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground')}>
              {p === 'mensal' ? 'Mensal' : 'Anual (2 meses grátis)'}
            </Link>
          ))}
        </div>
        <PlanCards
          plans={list}
          interval={interval}
          currentCode={current.code}
          action={(p) => {
            if (p.code === current.code || p.code === 'gratuito') return null;
            if (current.paid) return <p className="text-sm text-muted-foreground">Muda de plano no portal de faturação.</p>;
            const priceId = interval === 'year' ? list.find((x) => x.code === p.code)?.stripePriceYearlyId : list.find((x) => x.code === p.code)?.stripePriceMonthlyId;
            return <CheckoutButton planCode={p.code} interval={interval} label={`Escolher ${p.name}`} disabled={!canManage || !stripeReady || !priceId} />;
          }}
        />
        <p className="text-xs text-muted-foreground">
          Preços com IVA incluído. O pagamento é feito no Stripe: o Somar não recebe nem guarda dados do cartão. Cancela quando quiseres; mantens o plano até ao fim do período pago.
          {!stripeReady && ' Os pagamentos ainda não estão configurados neste servidor.'}
        </p>
      </div>
    </div>
  );
}
