'use client';

import { useActionState, useState, useTransition } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, Select, Textarea } from '@/components/ui/input';
import { FormError, SubmitButton } from '@/components/submit-button';
import { creditAction, issueInvoiceAction, paymentAction, sendInvoiceAction, toggleRemindersAction } from '../actions';

export function IssueButton({ id, legal }: { id: string; legal: boolean }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div className="grid justify-items-end gap-2">
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
          <span>Depois de emitida, a fatura não pode ser alterada{legal ? ' e é comunicada à AT' : ''}.</span>
          <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await issueInvoiceAction(id); if (r.error) setError(r.error); })}>
            {pending ? 'A emitir…' : 'Confirmar emissão'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Cancelar</Button>
        </div>
      ) : (
        <Button onClick={() => setConfirm(true)}>Emitir fatura</Button>
      )}
      {error && <p role="alert" className="max-w-md text-right text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function SendForm({ id, defaultTo, sentAt }: { id: string; defaultTo: string; sentAt: string | null }) {
  const [state, action] = useActionState(sendInvoiceAction.bind(null, id), {});
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state.error} />
      {state.ok && <p role="status" className="text-sm text-success">{state.message}</p>}
      {sentAt && <p className="text-xs text-muted-foreground">Última vez enviada a {sentAt}.</p>}
      <Field label="Email" htmlFor="to"><Input id="to" name="to" type="email" defaultValue={defaultTo} required /></Field>
      <Field label="Mensagem (opcional)" htmlFor="message"><Textarea id="message" name="message" placeholder="Olá, segue a fatura relativa a…" /></Field>
      <div><SubmitButton size="sm"><Send /> Enviar com PDF</SubmitButton></div>
    </form>
  );
}

export function PaymentForm({ id, remainingCents, today }: { id: string; remainingCents: number; today: string }) {
  const [state, action] = useActionState(paymentAction.bind(null, id), {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><FormError message={state.error} />{state.ok && <p role="status" className="text-sm text-success">{state.message}</p>}</div>
      <Field label="Valor (€)" htmlFor="amount"><Input id="amount" name="amount" inputMode="decimal" defaultValue={(remainingCents / 100).toFixed(2)} required /></Field>
      <Field label="Data" htmlFor="paidOn"><Input id="paidOn" name="paidOn" type="date" defaultValue={today} max={today} required /></Field>
      <Field label="Meio" htmlFor="method" className="sm:col-span-2">
        <Select id="method" name="method" defaultValue="transferencia">
          <option value="transferencia">Transferência</option>
          <option value="mb_way">MB WAY</option>
          <option value="multibanco">Multibanco</option>
          <option value="numerario">Numerário</option>
          <option value="cheque">Cheque</option>
        </Select>
      </Field>
      <div><SubmitButton size="sm">Registar</SubmitButton></div>
      <p className="text-xs text-muted-foreground sm:col-span-2">Os recebimentos por transferência são associados automaticamente quando chegam ao banco.</p>
    </form>
  );
}

export function CreditForm({ id }: { id: string }) {
  const [state, action] = useActionState(creditAction.bind(null, id), {});
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state.error} />
      <p className="text-sm text-muted-foreground">Uma fatura emitida não se apaga: emite-se uma nota de crédito pelo valor total, que fica associada a esta fatura.</p>
      <Field label="Motivo" htmlFor="reason"><Input id="reason" name="reason" required minLength={3} placeholder="Ex.: erro no valor faturado" /></Field>
      <div><SubmitButton size="sm" variant="destructive">Emitir nota de crédito</SubmitButton></div>
    </form>
  );
}

export function RemindersToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-3">
      <input type="checkbox" className="size-4 accent-[var(--primary)]" defaultChecked={enabled} disabled={pending} onChange={(e) => start(() => toggleRemindersAction(id, e.target.checked))} />
      Enviar lembretes automáticos se não for paga (3, 15 e 30 dias após o vencimento)
    </label>
  );
}
