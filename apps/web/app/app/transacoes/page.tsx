import type { Metadata } from 'next';
import Link from 'next/link';
import { and, desc, eq, ilike, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { Landmark, Paperclip, Upload } from 'lucide-react';
import { categories, receipts, transactions, withTenant } from '@somar/db';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { cn, formatDate, formatEur } from '@/lib/utils';
import { AiSuggestButton, CategorySelect, ConfirmAiButton, DuplicateControls } from './row-controls';
import { globalLlm } from '@/lib/ai';

export const metadata: Metadata = { title: 'Transações' };

const FILTERS = [
  { key: 'todas', label: 'Todas' },
  { key: 'rever', label: 'Por rever' },
  { key: 'sem-justificativo', label: 'Sem justificativo' },
  { key: 'duplicados', label: 'Possíveis duplicados' },
] as const;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ filtro?: string; q?: string }> }) {
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.key === sp.filtro)?.key ?? 'todas';
  const q = sp.q?.trim().slice(0, 100);
  const ctx = await requireAccount();

  const { rows, cats } = await withTenant(getDb(), ctx, async (tx) => {
    const cats = await tx
      .select({ id: categories.id, name: categories.name, kind: categories.kind, requiresReceipt: categories.requiresReceipt })
      .from(categories)
      .where(or(isNull(categories.accountId), eq(categories.accountId, ctx.accountId)))
      .orderBy(categories.name);
    const where = and(
      eq(transactions.accountId, ctx.accountId),
      ne(transactions.status, 'ignored'),
      q ? ilike(transactions.description, `%${q.replace(/[%_]/g, '')}%`) : undefined,
      filter === 'rever' ? eq(transactions.status, 'to_review') : undefined,
      filter === 'duplicados' ? isNotNull(transactions.duplicateOfId) : undefined,
      filter === 'sem-justificativo'
        ? and(isNull(receipts.id), eq(categories.kind, 'expense'), eq(categories.requiresReceipt, true), isNull(transactions.duplicateOfId))
        : undefined,
    );
    const rows = await tx
      .select({ t: transactions, receiptId: receipts.id, catKind: categories.kind, catRequires: categories.requiresReceipt })
      .from(transactions)
      .leftJoin(categories, eq(categories.id, transactions.categoryId))
      .leftJoin(receipts, eq(receipts.transactionId, transactions.id))
      .where(where)
      .orderBy(desc(transactions.bookingDate), desc(transactions.createdAt))
      .limit(300);
    return { rows, cats };
  });
  const total = (await withTenant(getDb(), ctx, (tx) =>
    tx.select({ total: sql<number>`count(*)::int` }).from(transactions).where(eq(transactions.accountId, ctx.accountId)),
  ))[0]?.total ?? 0;

  const uncategorized = rows.filter(({ t }) => !t.categoryId && !t.duplicateOfId).length;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Transações</h1>
          <p className="text-muted-foreground">Movimentos das tuas contas bancárias, categorizados automaticamente.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/app/bancos">
              <Landmark /> Ligar banco
            </Link>
          </Button>
          <Button asChild>
            <Link href="/app/transacoes/importar">
              <Upload /> Importar extrato
            </Link>
          </Button>
        </div>
      </div>

      {total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Landmark className="size-8 text-muted-foreground" />
            <p className="font-medium">Ainda não tens movimentos</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Liga o teu banco (acesso só de leitura, as credenciais nunca passam por nós) ou importa um extrato em CSV ou OFX.
            </p>
            <div className="mt-2 flex gap-2">
              <Button asChild>
                <Link href="/app/bancos">Ligar banco</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/app/transacoes/importar">Importar extrato</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav className="flex flex-wrap gap-1 rounded-full bg-muted p-1" aria-label="Filtros">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={`/app/transacoes?filtro=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                  aria-current={filter === f.key ? 'page' : undefined}
                  className={cn('rounded-full px-3.5 py-1.5 text-sm', filter === f.key ? 'bg-card font-medium shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                >
                  {f.label}
                </Link>
              ))}
            </nav>
            <form className="w-full sm:w-64">
              <input type="hidden" name="filtro" value={filter} />
              <Input name="q" defaultValue={q} placeholder="Pesquisar descrição…" aria-label="Pesquisar" className="h-9" />
            </form>
          </div>

          {uncategorized > 0 && globalLlm() && <AiSuggestButton count={uncategorized} />}
          {rows.length === 0 ? (
            <p className="rounded-2xl border bg-card px-6 py-10 text-center text-sm text-muted-foreground">Nada para mostrar com este filtro. 🎉</p>
          ) : (
            <ul className="grid gap-px overflow-hidden rounded-2xl border bg-border">
              {rows.map(({ t, receiptId, catKind, catRequires }) => {
                const missingReceipt = catKind === 'expense' && catRequires && !receiptId && !t.duplicateOfId;
                return (
                  <li key={t.id} className="grid gap-3 bg-card px-4 py-3.5 sm:grid-cols-[96px_1fr_auto_120px] sm:items-center sm:px-5">
                    <span className="text-sm text-muted-foreground tabular">{formatDate(t.bookingDate, 'short')}</span>
                    <div className="grid min-w-0 gap-1">
                      <span className="truncate font-medium" title={t.description}>
                        {t.description}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {t.duplicateOfId && <Badge variant="warning">Possível duplicado</Badge>}
                        {t.invoiceId && <Badge variant="success">Fatura associada</Badge>}
                        {receiptId && (
                          <Badge variant="muted">
                            <Paperclip className="size-3" /> Justificativo
                          </Badge>
                        )}
                        {missingReceipt && <Badge variant="destructive">Falta justificativo</Badge>}
                        {t.categorySource === 'ai' && <Badge>Sugestão da IA</Badge>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {t.duplicateOfId ? <DuplicateControls transactionId={t.id} /> : <CategorySelect transactionId={t.id} value={t.categoryId} options={cats} label={t.description} />}
                      {t.categorySource === 'ai' && t.status === 'to_review' && <ConfirmAiButton transactionId={t.id} confidence={t.categoryConfidence} />}
                    </div>
                    <span className={cn('text-right font-medium tabular', t.amountCents > 0 && 'text-success')}>
                      {t.amountCents > 0 ? '+' : ''}
                      {formatEur(t.amountCents)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
