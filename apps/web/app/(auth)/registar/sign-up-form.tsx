'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormError, SubmitButton } from '@/components/submit-button';
import { signUpAction } from '../actions';

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, {});
  return (
    <form action={action} className="grid gap-5">
      <FormError message={state.error} />
      <Field label="Nome" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required autoFocus />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Palavra-passe" htmlFor="password" hint="Pelo menos 10 caracteres, com letras e um número ou símbolo.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <label className="flex items-start gap-3 text-sm text-muted-foreground">
        <input type="checkbox" name="terms" className="mt-0.5 size-4 accent-[var(--primary)]" required />
        <span>
          Aceito os <Link href="/termos" className="text-primary hover:underline">termos</Link> e a{' '}
          <Link href="/privacidade" className="text-primary hover:underline">política de privacidade</Link>.
        </span>
      </label>
      <SubmitButton size="lg" pendingText="A criar conta…">
        Criar conta
      </SubmitButton>
    </form>
  );
}
