import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { FilePlus2, FileText, Users } from 'lucide-react';
import { clients, invoices, quotes, withTenant } from '@somar/db';
import { isOverdue, listOpenReceivables } from '@somar/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getDb } from '@/lib/db';
import { DOC_LABEL } from '@/lib/invoicing';
import { requireAccount } from '@/lib/session';
import { todayIso } from '@/lib/tax';
import { cn, formatDate, formatEur } from '@/lib/utils';
import { INVOICE_STATUS, QUOTE_STATUS } from './status';

export const metadata: Metadata = { title: 'Faturação' };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const tab = (await searchParams).tab === 'orcamentos' ? 'orcamentos' : 'faturas';
  const ctx = await requireAccount();
  const today = todayIso();
  const data = await withTenant(getDb(), ctx.accountId, async (tx) => ({
    receivables: await listOpenReceivables(tx, ctx.accountId, today),
    invoices: await tx.select({ i: invoices, clientName: clients.name }).from(invoices).leftJoin(clients, eq(clients.id, invoices.clientId)).where(eq(invoices.accountId, ctx.accountId)).orderBy(desc(invoices.issueDate), desc(invoices.createdAt)).limit(200),
    quotes: await tx.select({ q: quotes, clientName: clients.name }).from(quotes).leftJoin(clients, eq(clients.id, quotes.clientId)).where(eq(quotes.accountId, ctx.accountId)).orderBy(desc(quotes.issueDate), desc(quotes.createdAt)).limit(200),
  }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Faturação</h1>
          <p className="text-muted-foreground">Orçamentos e faturas ilimitados, com ATCUD e código QR.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" asChild>
            <Link href="/app/faturas/clientes"><Users /> Clientes</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/app/faturas/orcamentos/nova"><FileText /> Novo orçamento</Link>
          </Button>
          <Button asChild>
            <Link href="/app/faturas/nova"><FilePlus2 /> Nova fatura</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="grid gap-1 p-5"><span className="text-sm text-muted-foreground">Por receber</span><span className="text-2xl font-semibold tabular">{formatEur(data.receivables.totalCents)}</span><span className="text-xs text-muted-foreground">{data.receivables.count} fatura(s) em aberto</span></CardContent></Card>
        <Card><CardContent className="grid gap-1 p-5"><span className="text-sm text-muted-foreground">Em atraso</span><span className={cn('text-2xl font-semibold tabular', data.receivables.overdueCents > 0 && 'text-destructive')}>{formatEur(data.receivables.overdueCents)}</span><span className="text-xs text-muted-foreground">Lembretes automáticos aos 3, 15 e 30 dias</span></CardContent></Card>
        <Card><CardContent className="grid gap-1 p-5"><span className="text-sm text-muted-foreground">Faturado este ano (sem IVA)</span><span className="text-2xl font-semibold tabular">{formatEur(data.invoices.filter(({ i }) => i.status !== 'draft' && i.issueDate.startsWith(today.slice(0, 4))).reduce((s, { i }) => s + (i.docType === 'NC' ? -i.netCents : i.netCents), 0))}</span></CardContent></Card>
      </div>

      <nav className="flex gap-1 justify-self-start rounded-full bg-muted p-1 text-sm" aria-label="Documentos">
        {[['faturas', 'Faturas'], ['orcamentos', 'Orçamentos']].map(([k, l]) => (
          <Link key={k} href={`/app/faturas?tab=${k}`} aria-current={tab === k ? 'page' : undefined} className={cn('rounded-full px-3.5 py-1.5', tab === k ? 'bg-card font-medium shadow-xs' : 'text-muted-foreground')}>{l}</Link>
        ))}
      </nav>

      {tab === 'faturas' ? (
        data.invoices.length === 0 ? (
          <Empty text="Ainda não emitiste faturas." href="/app/faturas/nova" cta="Criar a primeira fatura" />
        ) : (
          <ul className="grid gap-px overflow-hidden rounded-2xl border bg-border">
            {data.invoices.map(({ i, clientName }) => {
              const st = INVOICE_STATUS[isOverdue(i, today) ? 'overdue' : i.status]!;
              return (
                <li key={i.id}>
                  <Link href={`/app/faturas/${i.id}`} className="grid gap-2 bg-card px-5 py-3.5 hover:bg-muted/40 sm:grid-cols-[150px_1fr_110px_120px_auto] sm:items-center">
                    <span className="font-medium">{i.number ?? `${DOC_LABEL[i.docType]} (rascunho)`}</span>
                    <span className="truncate text-sm text-muted-foreground">{clientName ?? 'Consumidor final'}</span>
                    <span className="text-sm text-muted-foreground">{formatDate(i.issueDate, 'short')}</span>
                    <span className="text-right font-medium tabular">{i.docType === 'NC' ? '−' : ''}{formatEur(i.totalCents)}</span>
                    <Badge variant={st.variant} className="justify-self-end">{st.label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )
      ) : data.quotes.length === 0 ? (
        <Empty text="Ainda não criaste orçamentos." href="/app/faturas/orcamentos/nova" cta="Criar orçamento" />
      ) : (
        <ul className="grid gap-px overflow-hidden rounded-2xl border bg-border">
          {data.quotes.map(({ q, clientName }) => {
            const st = QUOTE_STATUS[q.status]!;
            return (
              <li key={q.id}>
                <Link href={`/app/faturas/orcamentos/${q.id}`} className="grid gap-2 bg-card px-5 py-3.5 hover:bg-muted/40 sm:grid-cols-[150px_1fr_110px_120px_auto] sm:items-center">
                  <span className="font-medium">{q.number}</span>
                  <span className="truncate text-sm text-muted-foreground">{clientName ?? 'Sem cliente'}</span>
                  <span className="text-sm text-muted-foreground">{formatDate(q.issueDate, 'short')}</span>
                  <span className="text-right font-medium tabular">{formatEur(q.totalCents)}</span>
                  <Badge variant={st.variant} className="justify-self-end">{st.label}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Empty({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
        <FileText className="size-8 text-muted-foreground" />
        <p className="font-medium">{text}</p>
        <Button asChild><Link href={href}>{cta}</Link></Button>
      </CardContent>
    </Card>
  );
}
