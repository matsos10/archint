'use client';

import { useActionState } from 'react';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormError, SubmitButton } from '@/components/submit-button';
import { updateBrandingAction } from './actions';

export function BrandingForm(props: { brandColor: string; iban: string; hasLogo: boolean; withholdingExempt: boolean; individual: boolean }) {
  const [state, action] = useActionState(updateBrandingAction, {});
  return (
    <form action={action} className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2"><FormError message={state.error} />{state.ok && <p role="status" className="rounded-xl bg-success/10 px-4 py-3 text-sm text-success">{state.message}</p>}</div>
      <Field label="Cor de destaque" htmlFor="brandColor"><Input id="brandColor" name="brandColor" type="color" defaultValue={props.brandColor} className="h-11 w-24 p-1" /></Field>
      <Field label="Logótipo" htmlFor="logo" hint={props.hasLogo ? 'Já tens um logótipo. Carrega outro para substituir.' : 'PNG ou JPG, até 1 MB.'}><Input id="logo" name="logo" type="file" accept="image/png,image/jpeg" className="py-2" /></Field>
      <Field label="IBAN para pagamentos" htmlFor="iban" className="sm:col-span-2" hint="Aparece nas faturas e nos lembretes. Guardado encriptado."><Input id="iban" name="iban" defaultValue={props.iban} placeholder="PT50 0000 0000 0000 0000 0000 0" /></Field>
      {props.individual && (
        <label className="flex items-start gap-3 text-sm sm:col-span-2">
          <input type="checkbox" name="withholdingExempt" defaultChecked={props.withholdingExempt} className="mt-0.5 size-4 accent-[var(--primary)]" />
          <span>Estou dispensado de retenção na fonte (art. 101.º-B CIRS: rendimentos do ano anterior até ao limite legal). Indicado nas faturas.</span>
        </label>
      )}
      <div className="sm:col-span-2"><SubmitButton size="sm">Guardar</SubmitButton></div>
    </form>
  );
}
