'use client';

import { useActionState } from 'react';
import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { FormError, SubmitButton } from '@/components/submit-button';
import { savePartnerAction } from '../actions';

export interface PartnerFormValues {
  name: string;
  firmName: string;
  occNumber: string;
  email: string;
  city: string;
  bio: string;
  specialties: string[];
  services: { name: string; priceFromCents: number }[];
}

export function PartnerForm({ values, specialties }: { values: PartnerFormValues; specialties: [string, string][] }) {
  const [state, action] = useActionState(savePartnerAction, {});
  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormError message={state.error} />
        {state.ok && <p role="status" className="rounded-xl bg-success/10 px-4 py-3 text-sm text-success">{state.message}</p>}
      </div>
      <Field label="Nome profissional" htmlFor="name" error={state.fieldErrors?.name}><Input id="name" name="name" required defaultValue={values.name} /></Field>
      <Field label="Gabinete (opcional)" htmlFor="firmName"><Input id="firmName" name="firmName" defaultValue={values.firmName} /></Field>
      <Field label="N.º de inscrição na OCC" htmlFor="occNumber" error={state.fieldErrors?.occNumber} hint="Verificado pelo Somar antes de apareceres no diretório."><Input id="occNumber" name="occNumber" inputMode="numeric" required defaultValue={values.occNumber} /></Field>
      <Field label="Email profissional" htmlFor="email" error={state.fieldErrors?.email}><Input id="email" name="email" type="email" required defaultValue={values.email} /></Field>
      <Field label="Cidade" htmlFor="city"><Input id="city" name="city" defaultValue={values.city} /></Field>
      <Field label="Apresentação" htmlFor="bio" className="sm:col-span-2"><Textarea id="bio" name="bio" maxLength={1500} rows={4} defaultValue={values.bio} /></Field>
      <fieldset className="grid gap-2 text-sm sm:col-span-2">
        <legend className="mb-1 font-medium">Especialidades</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {specialties.map(([k, v]) => (
            <label key={k} className="flex items-center gap-3">
              <input type="checkbox" name="specialties" value={k} defaultChecked={values.specialties.includes(k)} className="size-4 accent-[var(--primary)]" /> {v}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="grid gap-3 sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Serviços e preço de referência (€, «desde»)</legend>
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid grid-cols-[1fr_8rem] gap-3">
            <Input aria-label={`Serviço ${i + 1}`} name={`service${i}Name`} placeholder="Ex.: IVA trimestral" defaultValue={values.services[i]?.name ?? ''} />
            <Input aria-label={`Preço do serviço ${i + 1}`} name={`service${i}Price`} inputMode="decimal" placeholder="40" defaultValue={values.services[i] ? String(values.services[i]!.priceFromCents / 100) : ''} />
          </div>
        ))}
      </fieldset>
      <div className="sm:col-span-2"><SubmitButton size="sm">Guardar perfil</SubmitButton></div>
    </form>
  );
}
