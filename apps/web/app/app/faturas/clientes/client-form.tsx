'use client';

import { useActionState, useState } from 'react';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormError, SubmitButton } from '@/components/submit-button';
import { saveClientAction } from '../actions';

interface Values { name: string; nif: string; email: string; addressLine: string; postalCode: string; city: string; country: string; isCompany: boolean; hasOrganizedAccounting: boolean; paymentTermsDays: number }

export function ClientForm({ id, initial }: { id?: string; initial?: Values }) {
  const [state, action] = useActionState(saveClientAction.bind(null, id), {});
  const [company, setCompany] = useState(initial?.isCompany ?? true);
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2" key={state.ok && !id ? String(Date.now()) : undefined}>
      <div className="sm:col-span-2"><FormError message={state.error} />{state.ok && <p role="status" className="text-sm text-success">{state.message}</p>}</div>
      <label className="flex items-center gap-3 text-sm sm:col-span-2">
        <input type="checkbox" name="isCompany" checked={company} onChange={(e) => setCompany(e.target.checked)} className="size-4 accent-[var(--primary)]" /> É uma empresa ou profissional
      </label>
      <Field label="Nome" htmlFor={`n-${id}`} error={fe.name} className="sm:col-span-2"><Input id={`n-${id}`} name="name" defaultValue={initial?.name} required /></Field>
      <Field label="NIF" htmlFor={`nif-${id}`} error={fe.nif}><Input id={`nif-${id}`} name="nif" defaultValue={initial?.nif} inputMode="numeric" /></Field>
      <Field label="Email" htmlFor={`e-${id}`} error={fe.email}><Input id={`e-${id}`} name="email" type="email" defaultValue={initial?.email} /></Field>
      <Field label="Morada" htmlFor={`a-${id}`} className="sm:col-span-2"><Input id={`a-${id}`} name="addressLine" defaultValue={initial?.addressLine} /></Field>
      <Field label="Código postal" htmlFor={`p-${id}`}><Input id={`p-${id}`} name="postalCode" defaultValue={initial?.postalCode} /></Field>
      <Field label="Localidade" htmlFor={`c-${id}`}><Input id={`c-${id}`} name="city" defaultValue={initial?.city} /></Field>
      <Field label="País (código)" htmlFor={`co-${id}`}><Input id={`co-${id}`} name="country" defaultValue={initial?.country ?? 'PT'} maxLength={2} /></Field>
      <Field label="Prazo de pagamento (dias)" htmlFor={`t-${id}`}><Input id={`t-${id}`} name="paymentTermsDays" type="number" min={0} max={365} defaultValue={initial?.paymentTermsDays ?? 30} /></Field>
      {company && (
        <label className="flex items-start gap-3 text-sm sm:col-span-2">
          <input type="checkbox" name="hasOrganizedAccounting" defaultChecked={initial?.hasOrganizedAccounting ?? true} className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span>Tem contabilidade organizada (é obrigado a reter IRS nas tuas faturas, art. 101.º CIRS)</span>
        </label>
      )}
      <div className="sm:col-span-2"><SubmitButton size="sm">{id ? 'Guardar' : 'Adicionar cliente'}</SubmitButton></div>
    </form>
  );
}
