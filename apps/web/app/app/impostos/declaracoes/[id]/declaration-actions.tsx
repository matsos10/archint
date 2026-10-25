'use client';

import { useActionState, useState, useTransition } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormError, SubmitButton } from '@/components/submit-button';
import { confirmDeclarationAction, submittedDeclarationAction } from '../../actions';

export function DeclarationActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string>();
  const [state, action] = useActionState(submittedDeclarationAction.bind(null, id), {});
  if (status === 'submitted') return <p className="flex items-center gap-2 font-medium text-success"><CheckCircle2 className="size-5" /> Declaração entregue.</p>;
  if (status === 'confirmed') {
    return (
      <form action={action} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <FormError message={state.error} />
        <Field label="Referência do comprovativo (opcional)" htmlFor="ref"><Input id="ref" name="ref" placeholder="Ex.: n.º da declaração" /></Field>
        <SubmitButton>Já submeti no portal</SubmitButton>
      </form>
    );
  }
  return (
    <div className="grid gap-3">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>Revi os valores e confirmo que correspondem à minha atividade. Sei que sou eu (ou o meu contabilista) quem submete a declaração.</span>
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div>
        <Button disabled={!checked || pending} onClick={() => start(async () => { const r = await confirmDeclarationAction(id); if (r && 'error' in r && r.error) setError(r.error); })}>
          Confirmar valores
        </Button>
      </div>
    </div>
  );
}
