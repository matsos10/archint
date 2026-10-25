'use client';

import { useActionState, useTransition } from 'react';
import { Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormError, SubmitButton } from '@/components/submit-button';
import { createDraftAction, publishAction } from '../actions';

export function DraftEditor({ initial }: { initial: string }) {
  const [state, action] = useActionState(createDraftAction, {});
  return (
    <form action={action} className="grid gap-4">
      <FormError message={state.error} />
      <Field label="Parâmetros (JSON)" htmlFor="params" hint="Guardar cria uma nova versão em rascunho, validada pelo schema do motor fiscal.">
        <Textarea id="params" name="params" defaultValue={initial} className="min-h-[480px] font-mono text-xs" spellCheck={false} />
      </Field>
      <Field label="Notas da alteração" htmlFor="notes">
        <Input id="notes" name="notes" placeholder="Ex.: escalões de IRS segundo a Lei do OE publicada em DR" />
      </Field>
      <div>
        <SubmitButton>Guardar como nova versão</SubmitButton>
      </div>
    </form>
  );
}

export function PublishButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" disabled={pending} onClick={() => start(() => publishAction(id))}>
      Publicar esta versão
    </Button>
  );
}
