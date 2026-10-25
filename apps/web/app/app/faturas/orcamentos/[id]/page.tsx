import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { clients, documentLines, quotes, withTenant } from '@somar/db';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { formatDate, formatEur } from '@/lib/utils';
import { editorData } from '../../editor-data';
import { InvoiceEditor } from '../../editor-client';
import { QUOTE_STATUS } from '../../status';
import { QuoteButtons, QuoteSendForm } from './quote-actions';

export const metadata: Metadata = { title: 'Orçamento' };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requireAccount();
  const d = await editorData(ctx.accountId);
  const data = await withTenant(getDb(), ctx.accountId, async (tx) => {
    const [row] = await tx.select({ q: quotes, client: clients }).from(quotes).leftJoin(clients, eq(clients.id, quotes.clientId)).where(and(eq(quotes.id, id), eq(quotes.accountId, ctx.accountId)));
    if (!row) return null;
    return { ...row, lines: await tx.select().from(documentLines).where(eq(documentLines.quoteId, id)).orderBy(documentLines.position) };
  });
  if (!data) notFound();
  const { q, client } = data;
  const st = QUOTE_STATUS[q.status]!;
  return (
    <div className="grid max-w-4xl gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{q.number}</h1>
            <Badge variant={st.variant}>{st.label}</Badge>
          </div>
          <p className="text-muted-foreground">{client?.name ?? 'Sem cliente'} · {formatDate(q.issueDate)} · válido até {formatDate(q.validUntil)} · {formatEur(q.totalCents)}</p>
          {q.invoiceId && <Link href={`/app/faturas/${q.invoiceId}`} className="text-sm text-primary hover:underline">Ver fatura</Link>}
        </div>
        <QuoteButtons id={q.id} status={q.status} pdfFileId={q.pdfFileId} />
      </div>
      {q.status !== 'invoiced' && (
        <InvoiceEditor
          kind="quote"
          id={q.id}
          params={d.params}
          context={d.context}
          clients={d.clients}
          initial={{
            clientId: q.clientId ?? '',
            docType: 'FT',
            issueDate: q.issueDate,
            dueDate: '',
            validUntil: q.validUntil ?? '',
            notes: q.notes ?? '',
            withholding: 'auto',
            lines: data.lines.map((l) => ({ description: l.description, quantity: String(l.quantity), unitPrice: (l.unitPriceCents / 100).toFixed(2), discountPct: String(l.discountPct), vatRateCode: l.vatRateCode, vatExemptionCode: l.vatExemptionCode ?? '' })),
          }}
        />
      )}
      {q.status !== 'invoiced' && (
        <Card>
          <CardHeader><CardTitle>Enviar ao cliente</CardTitle></CardHeader>
          <CardContent><QuoteSendForm id={q.id} defaultTo={client?.email ?? ''} /></CardContent>
        </Card>
      )}
    </div>
  );
}
