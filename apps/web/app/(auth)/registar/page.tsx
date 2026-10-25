import Link from 'next/link';
import type { Metadata } from 'next';
import { SignUpForm } from './sign-up-form';

export const metadata: Metadata = { title: 'Criar conta' };

export default function SignUpPage() {
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Cria a tua conta</h1>
        <p className="text-muted-foreground">Grátis, sem cartão. Demora menos de 3 minutos a configurar.</p>
      </div>
      <SignUpForm />
      <p className="text-sm text-muted-foreground">
        Já tens conta?{' '}
        <Link href="/entrar" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
