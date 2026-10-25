import type { Metadata } from 'next';
import { requireAccount } from '@/lib/session';
import { editorData } from '../../editor-data';
import { InvoiceEditor } from '../../editor-client';

export const metadata: Metadata = { title: 'Novo orçamento' };

export default async function NewQuotePage() {
  const ctx = await requireAccount();
  const d = await editorData(ctx.accountId);
  return (
    <div className="grid max-w-4xl gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Novo orçamento</h1>
      <InvoiceEditor
        kind="quote"
        params={d.params}
        context={d.context}
        clients={d.clients}
        initial={{ clientId: d.clients[0]?.id ?? '', docType: 'FT', issueDate: d.today, dueDate: '', validUntil: new Date(Date.parse(d.today) + 30 * 86_400_000).toISOString().slice(0, 10), notes: '', withholding: 'auto', lines: [{ description: '', quantity: '1', unitPrice: '', discountPct: '0', vatRateCode: 'normal', vatExemptionCode: '' }] }}
      />
    </div>
  );
}
