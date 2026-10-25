import type { Metadata } from 'next';
import Link from 'next/link';
import { and, count, eq } from 'drizzle-orm';
import { CalendarClock, ExternalLink } from 'lucide-react';
import { accounts, taxObligations, withTenant } from '@somar/db';
import { OBLIGATION_LABELS, computeSavings, effectiveObligationStatus, isDeclarative, listObligations, syncObligations } from '@somar/core';
import { globalLlm } from '@/lib/ai';
import { SavingsList } from './savings';
import { paramsToVerify } from '@somar/tax-engine';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { daysBetween, getParams, todayIso } from '@/lib/tax';
import { formatDate, formatEur } from '@/lib/utils';
import { ObligationActions } from './obligation-actions';
import { RegimeSimulator } from './regime-simulator';

export const metadata: Metadata = { title: 'Impostos e prazos' };

const PORTAL: Record<string, { label: string; href: string }> = {
  iva: { label: 'Portal das Finanças', href: 'https://www.portaldasfinancas.gov.pt' },
  irs: { label: 'Portal das Finanças', href: 'https://www.portaldasfinancas.gov.pt' },
  irc: { label: 'Portal das Finanças', href: 'https://www.portaldasfinancas.gov.pt' },
  ies: { label: 'Portal das Finanças', href: 'https://www.portaldasfinancas.gov.pt' },
  ss: { label: 'Segurança Social Direta', href: 'https://app.seg-social.pt' },
};

function relative(days: number) {
  if (days === 0) return 'Termina hoje';
  if (days === 1) return 'Termina amanhã';
  if (days > 1) return `Faltam ${days} dias`;
  return `Terminou há ${-days} dia${days === -1 ? '' : 's'}`;
}

const STATUS: Record<string, { label: string; variant: 'default' | 'muted' | 'success' | 'warning' | 'destructive' }> = {
  upcoming: { label: 'Por cumprir', variant: 'muted' },
  in_preparation: { label: 'Em preparação', variant: 'default' },
  ready: { label: 'Pronta', variant: 'default' },
  submitted: { label: 'Entregue', variant: 'success' },
  paid: { label: 'Paga', variant: 'success' },
  overdue: { label: 'Em atraso', variant: 'destructive' },
  not_applicable: { label: 'Automática', variant: 'muted' },
};

export default async function TaxesPage({ searchParams }: { searchParams: Promise<{ todos?: string }> }) {
  const showAll = (await searchParams).todos === '1';
  const ctx = await requireAccount();
  const db = getDb();
  const today = todayIso();
  const params = await getParams();
  const range = { from: `${Number(today.slice(0, 4)) - 1}-01-01`, to: `${Number(today.slice(0, 4)) + 1}-12-31` };

  const existing = await withTenant(db, ctx.accountId, async (tx) => {
    const [r] = await tx.select({ n: count() }).from(taxObligations).where(eq(taxObligations.accountId, ctx.accountId));
    return r?.n ?? 0;
  });
  if (existing === 0) await syncObligations(db, ctx.accountId, range, params);

  const { account, obligations, savings } = await withTenant(db, ctx.accountId, async (tx) => {
    const [account] = await tx.select().from(accounts).where(and(eq(accounts.id, ctx.accountId)));
    const all = await listObligations(tx, ctx.accountId, { from: range.from, to: range.to });
    // Sem IA por omissão (rápido e gratuito): os valores vêm sempre do motor fiscal.
    const savings = await computeSavings(tx, ctx, { llm: null, loaded: params }).catch(() => []);
    return { account: account!, obligations: all, savings };
  });

  const horizon = new Date(Date.parse(today) + (showAll ? 400 : 90) * 86_400_000).toISOString().slice(0, 10);
  const hiddenLater = obligations.filter((o) => o.status !== 'not_applicable' && o.dueDate > horizon).length;
  const rows = obligations
    .filter((o) => o.status !== 'not_applicable')
    .map((o) => ({ ...o, effective: effectiveObligationStatus(o, today), days: daysBetween(today, o.dueDate) }))
    .filter((o) => o.dueDate <= horizon && (o.days >= 0 || o.effective === 'overdue'));
  const overdue = rows.filter((o) => o.effective === 'overdue');
  const upcoming = rows.filter((o) => o.effective !== 'overdue');
  const groups = new Map<string, typeof upcoming>();
  for (const o of upcoming) {
    const key = o.dueDate.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  const year = Number(today.slice(0, 4));
  const yearParams = params.resolve(year);
  const toVerify = paramsToVerify(yearParams).length;
  const individual = account.legalForm === 'trabalhador_independente' || account.legalForm === 'eni';

  return (
    <div className="grid gap-10">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Impostos e prazos</h1>
        <p className="text-muted-foreground">O teu calendário fiscal, gerado a partir do teu estatuto e regimes.</p>
      </div>

      {overdue.length > 0 && (
        <section className="grid gap-3" aria-labelledby="overdue">
          <h2 id="overdue" className="font-semibold text-destructive">Em atraso</h2>
          <ObligationList rows={overdue} />
        </section>
      )}

      {upcoming.length === 0 && overdue.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <CalendarClock className="size-8 text-muted-foreground" />
            <p className="font-medium">Sem prazos nos próximos meses</p>
            <p className="max-w-sm text-sm text-muted-foreground">Quando houver uma declaração ou pagamento a fazer, aparece aqui com antecedência.</p>
          </CardContent>
        </Card>
      ) : (
        [...groups].map(([month, list]) => (
          <section key={month} className="grid gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(month + '-01T00:00:00Z'))}
            </h2>
            <ObligationList rows={list} />
          </section>
        ))
      )}

      {hiddenLater > 0 && (
        <Link href="/app/impostos?todos=1" className="justify-self-start text-sm font-medium text-primary hover:underline">
          Ver os próximos 12 meses ({hiddenLater} prazos)
        </Link>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Oportunidades de poupança</CardTitle>
          <CardDescription>Detetadas a partir da tua contabilidade; o efeito é calculado pelo motor fiscal.</CardDescription>
        </CardHeader>
        <CardContent>
          <SavingsList initial={savings} aiAvailable={!!globalLlm() && account.aiEnabled} />
        </CardContent>
      </Card>

      {individual && account.incomeTaxRegime !== 'irc_geral' && (
        <Card>
          <CardHeader>
            <CardTitle>Simplificado ou contabilidade organizada?</CardTitle>
            <CardDescription>Simula o IRS de {year} nos dois regimes com os teus números.</CardDescription>
          </CardHeader>
          <CardContent>
            <RegimeSimulator params={yearParams} incomeType={account.mainIncomeType ?? 'servicos_tabela_151'} activityStartDate={account.activityStartDate} hasEmploymentIncome={account.hasEmploymentIncome} />
          </CardContent>
        </Card>
      )}

      <Alert variant="warning">
        <span>
          Os prazos e cálculos seguem os parâmetros fiscais de {year} ({toVerify} valores assinalados para confirmação nas fontes oficiais).
          Confirma sempre no Portal das Finanças e na Segurança Social Direta. Tu (ou o teu contabilista) és responsável pelas declarações submetidas.
        </span>
      </Alert>
    </div>
  );
}

function ObligationList({ rows }: { rows: (Awaited<ReturnType<typeof listObligations>>[number] & { effective: string; days: number })[] }) {
  return (
    <ul className="grid gap-px overflow-hidden rounded-2xl border bg-border">
      {rows.map((o) => {
        const s = STATUS[o.effective] ?? STATUS.upcoming!;
        const portal = PORTAL[o.type.split('_')[0]!];
        const done = o.effective === 'submitted' || o.effective === 'paid';
        return (
          <li key={o.id} className="grid gap-3 bg-card px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="grid gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={done ? 'font-medium text-muted-foreground line-through' : 'font-medium'}>{OBLIGATION_LABELS[o.type]}</span>
                <Badge variant={s.variant}>{s.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {o.periodLabel} · Prazo: <strong className="font-medium text-foreground">{formatDate(o.dueDate)}</strong>
                {o.windowStart && <> (a partir de {formatDate(o.windowStart)})</>}
                {!done && <> · {relative(o.days)}</>}
                {o.amountEstimateCents != null && o.amountEstimateCents > 0 && <> · <strong className="font-medium text-foreground">{formatEur(o.amountEstimateCents)}</strong></>}
              </p>
              <p className="text-xs text-muted-foreground/80">
                {o.legalRef}
                {portal && (
                  <>
                    {' · '}
                    <a href={portal.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      {portal.label} <ExternalLink className="size-3" />
                    </a>
                  </>
                )}
              </p>
            </div>
            <ObligationActions id={o.id} status={o.effective} isPayment={o.type.includes('pagamento')} declarative={isDeclarative(o.type)} declarationId={o.declarationId} />
          </li>
        );
      })}
    </ul>
  );
}
