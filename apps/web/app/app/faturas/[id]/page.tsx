import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { Download } from 'lucide-react';
import { clients, documentLines, invoiceReminders, invoices, payments, withTenant } from '@somar/db';
import { isOverdue } from '@somar/core';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDb } from '@/lib/db';
import { DOC_LABEL } from '@/lib/invoicing';
import { requireAccount } from '@/lib/session';
import { formatDate, formatEur } from '@/lib/utils';
import { editorData } from '../editor-data';
import { InvoiceEditor } from '../editor-client';
import { INVOICE_STATUS } from '../status';
import { CreditForm, IssueButton, PaymentForm, RemindersToggle, SendForm } from './invoice-actions';

export const metadata: Metadata = { title: 'Fatura' };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requireAccount();
  const d = await editorData(ctx.accountId);
  const data = await withTenant(getDb(), ctx, async (tx) => {
    const [row] = await tx.select({ i: invoices, client: clients }).from(invoices).leftJoin(clients, eq(clients.id, invoices.clientId)).where(and(eq(invoices.id, id), eq(invoices.accountId, ctx.accountId)));
    if (!row) return null;
    return {
      ...row,
      lines: await tx.select().from(documentLines).where(eq(documentLines.invoiceId, id)).orderBy(documentLines.position),
      payments: await tx.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(payments.paidOn),
      reminders: await tx.select().from(invoiceReminders).where(eq(invoiceReminders.invoiceId, id)).orderBy(invoiceReminders.sentAt),
      related: row.i.relatedInvoiceId ? (await tx.select({ id: invoices.id, number: invoices.number }).from(invoices).where(eq(invoices.id, row.i.relatedInvoiceId)))[0] : null,
    };
  });
  if (!data) notFound();
  const { i, client } = data;
  const st = INVOICE_STATUS[isOverdue(i, d.today) ? 'overdue' : i.status]!;
  const open = ['issued', 'sent', 'partially_paid'].includes(i.status);

  if (i.status === 'draft') {
    return (
      <div className="grid max-w-4xl gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{DOC_LABEL[i.docType]} em rascunho</h1>
          <IssueButton id={i.id} legal={d.providerLegal} />
        </div>
        {!d.providerLegal && <Alert variant="warning">Modo de demonstração: a faturação certificada não está configurada. Os documentos emitidos não têm validade fiscal.</Alert>}
        {i.docType === 'NC' ? (
          <p className="text-sm text-muted-foreground">{i.notes}</p>
        ) : (
          <InvoiceEditor
            kind="invoice"
            id={i.id}
            params={d.params}
            context={d.context}
            clients={d.clients}
            initial={{
              clientId: i.clientId ?? '',
              docType: i.docType as 'FT',
              issueDate: i.issueDate,
              dueDate: i.dueDate ?? '',
              validUntil: '',
              notes: i.notes ?? '',
              withholding: 'auto',
              lines: data.lines.map((l) => ({ description: l.description, quantity: String(l.quantity), unitPrice: (l.unitPriceCents / 100).toFixed(2), discountPct: String(l.discountPct), vatRateCode: l.vatRateCode, vatExemptionCode: l.vatExemptionCode ?? '' })),
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid max-w-4xl gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{i.number}</h1>
            <Badge variant={st.variant}>{st.label}</Badge>
          </div>
          <p className="text-muted-foreground">
            {DOC_LABEL[i.docType]} · {client?.name ?? 'Consumidor final'} · {formatDate(i.issueDate)}
            {i.dueDate && i.docType === 'FT' && <> · vence a {formatDate(i.dueDate)}</>}
          </p>
          <p className="text-xs text-muted-foreground">ATCUD {i.atcud} · emitida via {i.provider === 'sandbox' ? 'modo de demonstração (sem validade fiscal)' : i.provider}</p>
          {data.related && <Link href={`/app/faturas/${data.related.id}`} className="text-xs text-primary hover:underline">Retifica {data.related.number}</Link>}
        </div>
        {i.pdfFileId && (
          <Button variant="outline" asChild>
            <a href={`/api/ficheiros/${i.pdfFileId}`} target="_blank" rel="noreferrer"><Download /> PDF</a>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-6">
          {data.lines.map((l) => (
            <div key={l.id} className="flex justify-between gap-4 text-sm">
              <span>{l.description} <span className="text-muted-foreground">· {String(l.quantity).replace('.', ',')} × {formatEur(l.unitPriceCents)} · IVA {l.vatRatePct}%{l.vatExemptionCode ? ` (${l.vatExemptionCode})` : ''}</span></span>
              <span className="tabular">{formatEur(l.netCents)}</span>
            </div>
          ))}
          <dl className="mt-2 grid gap-1 border-t pt-3 text-sm sm:ml-auto sm:w-72">
            <div className="flex justify-between"><dt className="text-muted-foreground">Sem IVA</dt><dd className="tabular">{formatEur(i.netCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">IVA</dt><dd className="tabular">{formatEur(i.vatCents)}</dd></div>
            {i.withholdingCents > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Retenção IRS</dt><dd className="tabular">−{formatEur(i.withholdingCents)}</dd></div>}
            <div className="flex justify-between font-semibold"><dt>Total</dt><dd className="tabular">{formatEur(i.totalCents)}</dd></div>
            {i.paidCents > 0 && <div className="flex justify-between text-success"><dt>Recebido</dt><dd className="tabular">{formatEur(i.paidCents)}</dd></div>}
          </dl>
        </CardContent>
      </Card>

      {i.docType !== 'NC' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Enviar ao cliente</CardTitle></CardHeader>
            <CardContent><SendForm id={i.id} defaultTo={client?.email ?? ''} sentAt={i.sentAt ? formatDate(i.sentAt) : null} /></CardContent>
          </Card>
          {open && (
            <Card>
              <CardHeader><CardTitle>Registar recebimento</CardTitle></CardHeader>
              <CardContent><PaymentForm id={i.id} remainingCents={i.totalCents - i.paidCents} today={d.today} /></CardContent>
            </Card>
          )}
        </div>
      )}

      {(data.payments.length > 0 || data.reminders.length > 0 || open) && (
        <Card>
          <CardHeader><CardTitle>Histórico de cobrança</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {data.payments.map((p) => <p key={p.id}>✓ {formatDate(p.paidOn)} — recebidos {formatEur(p.amountCents)} ({p.method.replace('_', ' ')}){p.transactionId ? ' · associado ao banco' : ''}</p>)}
            {data.reminders.map((r) => <p key={r.id} className="text-muted-foreground">✉ {formatDate(r.sentAt)} — lembrete {r.stage} enviado{r.aiGenerated ? ' (texto sugerido pela IA)' : ''}</p>)}
            {open && i.docType === 'FT' && <RemindersToggle id={i.id} enabled={i.remindersEnabled} />}
          </CardContent>
        </Card>
      )}

      {i.docType !== 'NC' && i.status !== 'cancelled' && (
        <details className="rounded-2xl border bg-card p-5">
          <summary className="cursor-pointer text-sm font-medium">Anular com nota de crédito</summary>
          <div className="mt-4"><CreditForm id={i.id} /></div>
        </details>
      )}
    </div>
  );
}
