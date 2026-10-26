import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { requireUser } from '@/lib/session';
import { OnboardingWizard } from './wizard';

export const metadata: Metadata = { title: 'Configurar a tua conta' };

export default async function OnboardingPage() {
  const session = await requireUser();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-6">
        <Link href="/" aria-label="Somar">
          <Logo />
        </Link>
        <span className="text-sm text-muted-foreground">{session.user.email}</span>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <OnboardingWizard firstName={session.user.name.split(' ')[0] ?? ''} />
        <p className="mt-8 text-center text-sm text-muted-foreground">
          És contabilista certificado e queres acompanhar clientes?{' '}
          <Link href="/contabilista/perfil" className="font-medium text-primary underline">
            Cria o teu perfil profissional
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
