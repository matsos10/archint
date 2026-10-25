import Link from 'next/link';
import type { Metadata } from 'next';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Entrar' };

export default function SignInPage() {
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Bem-vindo de volta</h1>
        <p className="text-muted-foreground">Entra para ver as tuas contas e os teus prazos.</p>
      </div>
      <SignInForm />
      <p className="text-sm text-muted-foreground">
        Ainda não tens conta?{' '}
        <Link href="/registar" className="font-medium text-primary hover:underline">
          Cria uma grátis
        </Link>
      </p>
    </div>
  );
}
