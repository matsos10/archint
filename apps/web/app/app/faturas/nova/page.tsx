import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { requireAccount } from '@/lib/session';
import { editorData } from '../editor-data';
import { InvoiceEditor } from '../editor-client';

export const metadata: Metadata = { title: 'Nova fatura' };

export default async function NewInvoicePage() {
  const ctx = await requireAccount();
  const d = await editorData(ctx.accountId);
  const missing = !d.account.nif || !d.account.addressLine || !d.account.postalCode || !d.account.city;
  return (
    <div className="grid max-w-4xl gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nova fatura</h1>
      {missing && (
        <Alert variant="warning">
          <span>Para emitir faturas precisas do teu NIF e morada completa. <Link href="/app/definicoes" className="font-medium underline">Completar dados</Link></span>
        </Alert>
      )}
      {d.clients.length === 0 && (
        <Alert variant="info"><span>Ainda não tens clientes. <Link href="/app/faturas/clientes" className="font-medium underline">Adicionar cliente</Link> ou fatura a consumidor final.</span></Alert>
      )}
      <InvoiceEditor
        kind="invoice"
        params={d.params}
        context={d.context}
        clients={d.clients}
        initial={{ clientId: d.clients[0]?.id ?? '', docType: 'FT', issueDate: d.today, dueDate: new Date(Date.parse(d.today) + (d.clients[0]?.paymentTermsDays ?? 30) * 86_400_000).toISOString().slice(0, 10), validUntil: '', notes: '', withholding: 'auto', lines: [{ description: '', quantity: '1', unitPrice: '', discountPct: '0', vatRateCode: 'normal', vatExemptionCode: '' }] }}
      />
    </div>
  );
}
