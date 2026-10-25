import type { Metadata } from 'next';
import { and, desc, eq, sql } from 'drizzle-orm';
import { FileText, Receipt } from 'lucide-react';
import { receipts, transactions, withTenant } from '@somar/db';
import { matchScore } from '@somar/core';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { formatDate, formatEur } from '@/lib/utils';
import { ReceiptEditor, UploadForm } from './forms';

export const metadata: Metadata = { title: 'Despesas e justificativos' };

const STATUS: Record<string, { label: string; variant: 'muted' | 'default' | 'success' | 'warning' | 'destructive' }> = {
  uploaded: { label: 'Por ler', variant: 'muted' },
  processing: { label: 'A ler…', variant: 'default' },
  extracted: { label: 'Lido — confirma os dados', variant: 'warning' },
  matched: { label: 'Associado', variant: 'success' },
  confirmed: { label: 'Confirmado', variant: 'success' },
  error: { label: 'Erro na leitura', variant: 'destructive' },
};

export default async function ExpensesPage() {
  const ctx = await requireAccount();
  const { list, candidates } = await withTenant(getDb(), ctx.accountId, async (tx) => {
    const list = await tx
      .select({ r: receipts, txDesc: transactions.description, txDate: transactions.bookingDate, txAmount: transactions.amountCents })
      .from(receipts)
      .leftJoin(transactions, eq(transactions.id, receipts.transactionId))
      .where(eq(receipts.accountId, ctx.accountId))
      .orderBy(desc(receipts.createdAt))
      .limit(200);
    const candidates = await tx
      .select({ id: transactions.id, bookingDate: transactions.bookingDate, amountCents: transactions.amountCents, description: transactions.description, duplicateOfId: transactions.duplicateOfId })
      .from(transactions)
      .where(and(eq(transactions.accountId, ctx.accountId), sql`${transactions.amountCents} < 0`, sql`not exists (select 1 from receipts r where r.transaction_id = ${transactions.id})`))
      .orderBy(desc(transactions.bookingDate))
      .limit(400);
    return { list, candidates };
  });

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Despesas e justificativos</h1>
        <p className="text-muted-foreground">Fotografa ou carrega as faturas das despesas: associamo-las à transação certa.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Adicionar justificativos</CardTitle>
          <CardDescription>Fatura em teu nome, com o teu NIF. Sem fatura válida não podes deduzir o IVA (art. 19.º, n.º 2 CIVA).</CardDescription>
        </CardHeader>
        <CardContent>
          <UploadForm />
        </CardContent>
      </Card>

      {list.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Receipt className="size-8 text-muted-foreground" />
            <p className="font-medium">Ainda sem justificativos</p>
            <p className="max-w-sm text-sm text-muted-foreground">Na app móvel, usa a câmara para fotografar o talão logo após a compra.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-px overflow-hidden rounded-2xl border bg-border">
          {list.map(({ r, txDesc, txDate, txAmount }) => {
            const s = STATUS[r.status] ?? STATUS.uploaded!;
            const suggestions = r.transactionId
              ? []
              : candidates
                  .map((c) => ({ c, s: matchScore(r, c) }))
                  .filter((x) => x.s > 0)
                  .sort((a, b) => b.s - a.s)
                  .slice(0, 3)
                  .map((x) => ({ id: x.c.id, label: `${formatDate(x.c.bookingDate, 'short')} · ${x.c.description} · ${formatEur(-x.c.amountCents)}` }));
            return (
              <li key={r.id} className="grid gap-3 bg-card px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <a href={`/api/ficheiros/${r.fileId}`} target="_blank" rel="noreferrer" className="mt-0.5 rounded-lg bg-muted p-2 text-muted-foreground hover:text-foreground" aria-label="Abrir ficheiro">
                      <FileText className="size-5" />
                    </a>
                    <div className="grid gap-0.5">
                      <span className="font-medium">{r.supplierName ?? r.supplierNif ?? 'Justificativo'}</span>
                      <span className="text-sm text-muted-foreground">
                        {r.documentDate ? formatDate(r.documentDate) : 'Data por indicar'}
                        {r.totalCents != null && <> · {formatEur(r.totalCents)}</>}
                        {r.vatCents != null && <> (IVA {formatEur(r.vatCents)})</>}
                      </span>
                      {txDesc && (
                        <span className="text-xs text-muted-foreground">
                          Transação: {formatDate(txDate!, 'short')} · {txDesc} · {formatEur(-(txAmount ?? 0))}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant={s.variant}>{s.label}</Badge>
                </div>
                {r.status !== 'confirmed' && (
                  <ReceiptEditor
                    receiptId={r.id}
                    initial={{
                      supplierName: r.supplierName ?? '',
                      supplierNif: r.supplierNif ?? '',
                      documentNumber: r.documentNumber ?? '',
                      documentDate: r.documentDate ?? '',
                      total: r.totalCents != null ? (r.totalCents / 100).toFixed(2) : '',
                      vat: r.vatCents != null ? (r.vatCents / 100).toFixed(2) : '',
                      transactionId: r.transactionId ?? '',
                    }}
                    suggestions={suggestions}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
