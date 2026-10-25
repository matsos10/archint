'use client';

import { useActionState } from 'react';
import { Camera } from 'lucide-react';
import { Field } from '@/components/ui/label';
import { Input, Select } from '@/components/ui/input';
import { FormError, SubmitButton } from '@/components/submit-button';
import { confirmReceiptAction, uploadReceiptAction } from './actions';

export function UploadForm() {
  const [state, action] = useActionState(uploadReceiptAction, {});
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state.error} />
      {state.ok && <p role="status" className="rounded-xl bg-success/10 px-4 py-3 text-sm text-success">{state.message}</p>}
      <Field label="Ficheiros" htmlFor="files" hint="Fotografia (JPG, PNG, HEIC) ou PDF, até 10 MB cada.">
        <Input id="files" name="files" type="file" multiple accept="image/*,application/pdf" capture="environment" required className="py-2" />
      </Field>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Tenho o texto do código QR da fatura</summary>
        <div className="mt-3">
          <Field label="Conteúdo do QR (A:…*B:…*…)" htmlFor="qr" hint="Lido por uma app de QR; preenche os dados automaticamente.">
            <Input id="qr" name="qr" placeholder="A:123456789*B:…" />
          </Field>
        </div>
      </details>
      <div>
        <SubmitButton pendingText="A carregar…">
          <Camera /> Carregar
        </SubmitButton>
      </div>
    </form>
  );
}

export function ReceiptEditor({
  receiptId,
  initial,
  suggestions,
}: {
  receiptId: string;
  initial: Record<'supplierName' | 'supplierNif' | 'documentNumber' | 'documentDate' | 'total' | 'vat' | 'transactionId', string>;
  suggestions: { id: string; label: string }[];
}) {
  const [state, action] = useActionState(confirmReceiptAction.bind(null, receiptId), {});
  const fe = state.fieldErrors ?? {};
  return (
    <details className="rounded-xl bg-muted/50 px-4 py-3" open={!initial.total}>
      <summary className="cursor-pointer text-sm font-medium">Rever e confirmar dados</summary>
      <form action={action} className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <FormError message={state.error} />
        </div>
        <Field label="Fornecedor" htmlFor={`sn-${receiptId}`}>
          <Input id={`sn-${receiptId}`} name="supplierName" defaultValue={initial.supplierName} />
        </Field>
        <Field label="NIF do fornecedor" htmlFor={`nif-${receiptId}`} error={fe.supplierNif}>
          <Input id={`nif-${receiptId}`} name="supplierNif" defaultValue={initial.supplierNif} inputMode="numeric" maxLength={9} />
        </Field>
        <Field label="N.º do documento" htmlFor={`dn-${receiptId}`}>
          <Input id={`dn-${receiptId}`} name="documentNumber" defaultValue={initial.documentNumber} />
        </Field>
        <Field label="Data" htmlFor={`dd-${receiptId}`} error={fe.documentDate}>
          <Input id={`dd-${receiptId}`} name="documentDate" type="date" defaultValue={initial.documentDate} />
        </Field>
        <Field label="Total (€)" htmlFor={`t-${receiptId}`}>
          <Input id={`t-${receiptId}`} name="total" inputMode="decimal" defaultValue={initial.total} />
        </Field>
        <Field label="IVA (€)" htmlFor={`v-${receiptId}`}>
          <Input id={`v-${receiptId}`} name="vat" inputMode="decimal" defaultValue={initial.vat} />
        </Field>
        <Field label="Transação" htmlFor={`tx-${receiptId}`} className="sm:col-span-3">
          <Select id={`tx-${receiptId}`} name="transactionId" defaultValue={initial.transactionId}>
            <option value="">{initial.transactionId ? 'Manter a associação atual' : 'Associar automaticamente'}</option>
            {suggestions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
            <option value="none">Paga em numerário (sem transação)</option>
          </Select>
        </Field>
        <div className="sm:col-span-3">
          <SubmitButton size="sm">Confirmar</SubmitButton>
        </div>
      </form>
    </details>
  );
}
