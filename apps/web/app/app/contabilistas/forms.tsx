'use client';

import { useActionState, useState } from 'react';
import { DELEGATION_SCOPES_UI } from './scopes';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Select, Textarea } from '@/components/ui/input';
import { FormError, SubmitButton } from '@/components/submit-button';
import { formatEur } from '@/lib/utils';
import { requestDelegationAction, revokeDelegationAction } from './actions';

export function RequestForm({ partnerId, services }: { partnerId: string; services: { code: string; name: string; priceFromCents: number }[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(requestDelegationAction.bind(null, partnerId), {});
  if (state.ok) return <p role="status" className="rounded-xl bg-success/10 px-4 py-3 text-sm text-success">{state.message}</p>;
  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>Pedir acompanhamento</Button>;
  return (
    <form action={action} className="grid gap-4 rounded-xl bg-muted/50 p-4">
      <FormError message={state.error} />
      {services.length > 0 && (
        <Field label="Serviço" htmlFor={`svc-${partnerId}`}>
          <Select id={`svc-${partnerId}`} name="serviceCode" defaultValue={services[0]!.code}>
            {services.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} (desde {formatEur(s.priceFromCents)})
              </option>
            ))}
          </Select>
        </Field>
      )}
      <fieldset className="grid gap-2 text-sm">
        <legend className="mb-1 font-medium">O que o contabilista pode fazer na tua conta</legend>
        {DELEGATION_SCOPES_UI.map((s) => (
          <label key={s.code} className="flex items-start gap-3">
            <input type="checkbox" name="scopes" value={s.code} defaultChecked={s.code !== 'accounting'} disabled={s.code === 'read'} className="mt-0.5 size-4 accent-[var(--primary)]" />
            <span>
              {s.label}
              {s.code === 'read' && <span className="text-muted-foreground"> (sempre incluído)</span>}
            </span>
          </label>
        ))}
      </fieldset>
      <Field label="Mensagem (opcional)" htmlFor={`msg-${partnerId}`}>
        <Textarea id={`msg-${partnerId}`} name="message" maxLength={1000} rows={3} placeholder="Ex.: preciso de ajuda com o IVA trimestral e o IRS." />
      </Field>
      <p className="text-xs text-muted-foreground">O acesso dura 12 meses e podes terminá-lo a qualquer momento. Cada entrada do contabilista na tua conta fica registada.</p>
      <div className="flex gap-2">
        <SubmitButton size="sm" pendingText="A enviar…">Enviar pedido</SubmitButton>
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function RevokeButton({ id, label }: { id: string; label: string }) {
  const [state, action] = useActionState(revokeDelegationAction.bind(null, id), {});
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm('Terminar o acesso deste contabilista à tua conta?')) e.preventDefault();
      }}
    >
      <FormError message={state.error} />
      <SubmitButton size="sm" variant="outline" pendingText="A terminar…">
        {label}
      </SubmitButton>
    </form>
  );
}
