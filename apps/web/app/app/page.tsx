import type { Metadata } from 'next';
import Link from 'next/link';
import { and, asc, eq, gte } from 'drizzle-orm';
import { AlertTriangle, ArrowRight, CalendarClock, FileWarning, Landmark, Upload } from 'lucide-react';
import { accounts, insights, taxObligations, transactions, withTenant } from '@somar/db';
import { OBLIGATION_LABELS, buildYearData, reviewCounts } from '@somar/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { daysBetween, getParams, todayIso } from '@/lib/tax';
import { cn, formatDate, formatEur } from '@/lib/utils';

export const metadata: Metadata = { title: 'Painel' };

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const ctx = await requireAccount();
  const today = todayIso();
  const sp = await searchParams;
  const currentYear = Number(today.slice(0, 4));
  const year = sp.ano && /^\d{4}$/.test(sp.ano) ? Math.min(Math.max(Number(sp.ano), 2020), currentYear) : currentYear;
  const params = await getParams();

  const data = await withTenant(getDb(), ctx.accountId, async (tx) => {
    const [account] = await tx.select().from(accounts).where(eq(accounts.id, ctx.accountId));
    const [anyTx] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.accountId, ctx.accountId)).limit(1);
    const year_ = await buildYearData(tx, ctx.accountId, year, params);
    const counts = await reviewCounts(tx, ctx.accountId);
    const alerts = await tx
      .select()
      .from(insights)
      .where(and(eq(insights.accountId, ctx.accountId), eq(insights.status, 'open')))
      .orderBy(asc(insights.severity))
      .limit(6);
    const next = await tx
      .select()
      .from(taxObligations)
      .where(and(eq(taxObligations.accountId, ctx.accountId), gte(taxObligations.dueDate, today), eq(taxObligations.status, 'upcoming')))
      .orderBy(asc(taxObligations.dueDate))
      .limit(4);
    return { account: account!, hasTx: !!anyTx, year: year_, counts, alerts, next };
  });

  const { summary: s, vat, irs, irc, socialSecurity } = data.year;
  const individual = data.account.legalForm === 'trabalhador_independente' || data.account.legalForm === 'eni';
  const currentVat = vat.find((p) => p.period.start <= today && today <= p.period.end) ?? vat.filter((p) => p.period.end < today).at(-1);
  const nextSs = socialSecurity?.quarters.flatMap((q) => q.months).find((m) => m.dueDate >= today);
  const maxBar = Math.max(1, ...data.year.months.map((m) => Math.max(m.incomeCents, m.expensesCents)));

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{data.account.name}</h1>
          <p className="text-muted-foreground">
            {year === currentYear ? `Situação de ${year} até hoje (${formatDate(today)})` : `Ano de ${year}`}
          </p>
        </div>
        <nav className="flex gap-1 rounded-full bg-muted p-1 text-sm" aria-label="Ano">
          {[currentYear - 1, currentYear].map((y) => (
            <Link key={y} href={`/app?ano=${y}`} aria-current={y === year ? 'page' : undefined} className={cn('rounded-full px-3.5 py-1.5', y === year ? 'bg-card font-medium shadow-xs' : 'text-muted-foreground')}>
              {y}
            </Link>
          ))}
        </nav>
      </div>

      {!data.hasTx && (
        <Card className="border-primary/30 bg-accent/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-6">
            <div className="grid gap-1">
              <p className="font-medium">Começa por trazer os teus movimentos</p>
              <p className="text-sm text-muted-foreground">Liga o banco ou importa um extrato para vermos receitas, despesas e impostos em tempo real.</p>
            </div>
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/app/bancos">
                  <Landmark /> Ligar banco
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/app/transacoes/importar">
                  <Upload /> Importar
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumo">
        <Kpi label="Receitas (sem IVA)" value={s.incomeNetCents} hint={data.year.incomeSource === 'transactions' ? 'Estimadas pelos recebimentos' : 'Faturas emitidas'} />
        <Kpi label="Despesas da atividade" value={s.expensesCents} hint="Sem o IVA que recuperas" />
        <Kpi label={individual ? 'IRS + Segurança Social' : 'IRC estimado'} value={individual ? s.incomeTaxCents + s.socialSecurityCents : s.incomeTaxCents} hint={individual ? `IRS ${formatEur(s.incomeTaxCents)} · SS ${formatEur(s.socialSecurityCents)}` : 'Antes de pagamentos por conta'} />
        <Kpi label="Resultado estimado" value={s.resultCents} hint="Receitas − despesas − impostos" emphasis />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Receitas e despesas por mês</CardTitle>
            <CardDescription>
              <span className="mr-4 inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary" /> Receitas</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-muted-foreground/40" /> Despesas</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-44 items-end gap-1.5" role="img" aria-label="Gráfico de barras de receitas e despesas mensais">
              {MONTHS.map((label, i) => {
                const m = data.year.months.find((x) => Number(x.month.slice(5, 7)) === i + 1);
                return (
                  <div key={label} className="flex h-full flex-1 flex-col justify-end gap-1">
                    <div className="flex flex-1 items-end justify-center gap-0.5">
                      <div className="w-1/2 rounded-t bg-primary" style={{ height: `${((m?.incomeCents ?? 0) / maxBar) * 100}%` }} title={`Receitas ${formatEur(m?.incomeCents ?? 0)}`} />
                      <div className="w-1/2 rounded-t bg-muted-foreground/40" style={{ height: `${((m?.expensesCents ?? 0) / maxBar) * 100}%` }} title={`Despesas ${formatEur(m?.expensesCents ?? 0)}`} />
                    </div>
                    <span className="text-center text-[11px] text-muted-foreground">{label}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Impostos estimados</CardTitle>
            <CardDescription>Calculados com os parâmetros fiscais de {year}.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            {currentVat?.applicable ? (
              <Row label={`IVA — ${currentVat.period.start.slice(5, 7) === currentVat.period.end.slice(5, 7) ? 'mês' : 'trimestre'} até ${formatDate(currentVat.period.end, 'short')}`} value={currentVat.balanceCents} note={currentVat.dueDates ? `Pagar até ${formatDate(currentVat.dueDates.payment)}` : undefined} />
            ) : (
              <p className="text-muted-foreground">Sem IVA a entregar (regime de isenção).</p>
            )}
            {irs && (
              <Row
                label={`IRS ${year} (estimativa anual)`}
                value={irs.resultCents}
                note={irs.resultCents < 0 ? `Previsão de reembolso de ${formatEur(-irs.resultCents)}, já com ${formatEur(irs.withholdingCents)} retidos` : `Imposto ${formatEur(irs.netTaxCents)} − retenções ${formatEur(irs.withholdingCents)}`}
              />
            )}
            {irc && <Row label={`IRC ${year} (estimativa)`} value={irc.totalCents} />}
            {nextSs && <Row label={`Segurança Social — ${nextSs.month.slice(5)}/${nextSs.month.slice(0, 4)}`} value={nextSs.contributionCents} note={`Pagar entre ${formatDate(nextSs.paymentWindowStart, 'short')} e ${formatDate(nextSs.dueDate, 'short')}`} />}
            <Link href="/app/impostos" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Ver calendário e simulador <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-warning" /> A precisar da tua atenção
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {data.counts.toReview > 0 && (
              <Link href="/app/transacoes?filtro=rever" className="flex justify-between rounded-xl bg-muted px-4 py-2.5 hover:bg-muted/70">
                <span>Movimentos por rever</span>
                <Badge variant="warning">{data.counts.toReview}</Badge>
              </Link>
            )}
            {data.alerts.length === 0 && data.counts.toReview === 0 ? (
              <p className="text-muted-foreground">Tudo em ordem. ✨</p>
            ) : (
              data.alerts.map((a) => (
                <Link
                  key={a.id}
                  href={a.code === 'missing_receipt' ? '/app/transacoes?filtro=sem-justificativo' : a.code === 'duplicate_transaction' ? '/app/transacoes?filtro=duplicados' : '/app/transacoes'}
                  className="flex items-start gap-3 rounded-xl px-4 py-2.5 hover:bg-muted"
                >
                  <FileWarning className={cn('mt-0.5 size-4 shrink-0', a.severity === 'critical' ? 'text-destructive' : 'text-warning')} />
                  <span className="grid gap-0.5">
                    <span className="font-medium">{a.title}</span>
                    {a.body && <span className="text-muted-foreground">{a.body}</span>}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-primary" /> Próximos prazos
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {data.next.length === 0 ? (
              <p className="text-muted-foreground">Sem prazos próximos.</p>
            ) : (
              data.next.map((o) => {
                const d = daysBetween(today, o.dueDate);
                return (
                  <div key={o.id} className="flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 hover:bg-muted">
                    <span className="grid gap-0.5">
                      <span className="font-medium">{OBLIGATION_LABELS[o.type]}</span>
                      <span className="text-muted-foreground">{o.periodLabel}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-medium">{formatDate(o.dueDate, 'short')}</span>
                      <span className={cn('text-xs', d <= 7 ? 'text-destructive' : 'text-muted-foreground')}>{d === 0 ? 'hoje' : `em ${d} dias`}</span>
                    </span>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {data.year.warnings.length > 0 && (
        <ul className="grid gap-1 text-xs text-muted-foreground">
          {[...new Set(data.year.warnings)].map((w) => (
            <li key={w}>• {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Kpi({ label, value, hint, emphasis }: { label: string; value: number; hint?: string; emphasis?: boolean }) {
  return (
    <Card className={emphasis ? 'border-primary/30 bg-accent/30' : undefined}>
      <CardContent className="grid gap-1 p-5">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={cn('text-2xl font-semibold tracking-tight tabular', value < 0 && emphasis && 'text-destructive')}>{formatEur(value)}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="grid gap-0.5">
        <span>{label}</span>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </span>
      <span className={cn('font-semibold tabular', value < 0 && 'text-success')}>{formatEur(value)}</span>
    </div>
  );
}
