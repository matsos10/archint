'use client';

import { useActionState } from 'react';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormError, SubmitButton } from '@/components/submit-button';
import { twoFactorAction } from '../../actions';

export function TwoFactorForm() {
  const [state, action] = useActionState(twoFactorAction, {});
  return (
    <form action={action} className="grid gap-5">
      <FormError message={state.error} />
      <Field label="Código" htmlFor="code">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          autoFocus
          maxLength={9}
          className="text-center text-2xl tracking-[0.4em] tabular"
        />
      </Field>
      <SubmitButton size="lg" pendingText="A verificar…">
        Verificar
      </SubmitButton>
    </form>
  );
}
