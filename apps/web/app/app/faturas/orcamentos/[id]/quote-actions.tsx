'use client';

import { useActionState, useTransition } from 'react';
import { Check, Download, FileOutput, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { FormError, SubmitButton } from '@/components/submit-button';
import { quoteAction, sendQuoteAction } from '../../actions';

export function QuoteButtons({ id, status, pdfFileId }: { id: string; status: string; pdfFileId: string | null }) {
  const [pending, start] = useTransition();
  if (status === 'invoiced') return null;
  return (
    <div className="flex flex-wrap gap-2">
      {pdfFileId ? (
        <Button variant="outline" size="sm" asChild><a href={`/api/ficheiros/${pdfFileId}`} target="_blank" rel="noreferrer"><Download /> PDF</a></Button>
      ) : (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => void (await quoteAction(id, 'pdf')))}><Download /> Gerar PDF</Button>
      )}
      {status !== 'accepted' && <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => void (await quoteAction(id, 'accept')))}><Check /> Aceite</Button>}
      {status !== 'rejected' && <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => void (await quoteAction(id, 'reject')))}><X /> Recusado</Button>}
      <Button size="sm" disabled={pending} onClick={() => start(async () => void (await quoteAction(id, 'convert')))}><FileOutput /> Converter em fatura</Button>
    </div>
  );
}

export function QuoteSendForm({ id, defaultTo }: { id: string; defaultTo: string }) {
  const [state, action] = useActionState(sendQuoteAction.bind(null, id), {});
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state.error} />
      {state.ok && <p role="status" className="text-sm text-success">{state.message}</p>}
      <Field label="Email" htmlFor="qto"><Input id="qto" name="to" type="email" defaultValue={defaultTo} required /></Field>
      <Field label="Mensagem (opcional)" htmlFor="qmsg"><Textarea id="qmsg" name="message" /></Field>
      <div><SubmitButton size="sm">Enviar orçamento</SubmitButton></div>
    </form>
  );
}
