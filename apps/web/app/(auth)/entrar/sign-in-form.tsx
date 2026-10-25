'use client';

import { useActionState } from 'react';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormError, SubmitButton } from '@/components/submit-button';
import { signInAction } from '../actions';

export function SignInForm() {
  const [state, action] = useActionState(signInAction, {});
  return (
    <form action={action} className="grid gap-5">
      <FormError message={state.error} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Palavra-passe" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton size="lg" pendingText="A entrar…">
        Entrar
      </SubmitButton>
    </form>
  );
}
