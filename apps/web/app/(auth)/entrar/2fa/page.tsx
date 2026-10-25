import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { TwoFactorForm } from './two-factor-form';

export const metadata: Metadata = { title: 'Verificação em dois passos' };

export default async function TwoFactorPage() {
  const s = await getSession();
  if (!s) redirect('/entrar');
  if (s.twoFactorVerified) redirect('/app');
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Verificação em dois passos</h1>
        <p className="text-muted-foreground">
          Abre a tua aplicação de autenticação e escreve o código de 6 dígitos. Também podes usar um código de recuperação.
        </p>
      </div>
      <TwoFactorForm />
    </div>
  );
}
