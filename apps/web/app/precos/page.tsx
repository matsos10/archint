import type { Metadata } from 'next';
import Link from 'next/link';
import { asc, eq } from 'drizzle-orm';
import { plans } from '@somar/db';
import { Logo } from '@/components/brand/logo';
import { PlanCards } from '@/components/billing/plan-cards';
import { Disclaimer } from '@/components/disclaimer';
import { Button } from '@/components/ui/button';
import { getDb } from '@/lib/db';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Preços' };
export const dynamic = 'force-dynamic';

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const interval = (await searchParams).periodo === 'anual' ? 'year' : 'month';
  const list = await getDb().select().from(plans).where(eq(plans.active, true)).orderBy(asc(plans.sortOrder));
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" aria-label="Somar, página inicial">
          <Logo />
        </Link>
        <Button asChild>
          <Link href="/registar">Começar grátis</Link>
        </Button>
      </header>
      <main className="mx-auto grid max-w-6xl gap-8 px-6 pb-20">
        <div className="grid gap-3 text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Preços simples, sem surpresas</h1>
          <p className="text-muted-foreground">Começa grátis. Muda ou cancela quando quiseres.</p>
        </div>
        <div className="mx-auto flex gap-1 rounded-xl bg-muted p-1 text-sm" role="group" aria-label="Periodicidade">
          {(['mensal', 'anual'] as const).map((p) => (
            <Link key={p} href={`/precos?periodo=${p}`} className={cn('rounded-lg px-3 py-1.5', (p === 'anual') === (interval === 'year') ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground')}>
              {p === 'mensal' ? 'Mensal' : 'Anual (2 meses grátis)'}
            </Link>
          ))}
        </div>
        <PlanCards
          plans={list}
          interval={interval}
          action={(p) => (
            <Button className="w-full" variant={p.code === 'plus' ? 'default' : 'outline'} asChild>
              <Link href="/registar">{p.code === 'gratuito' ? 'Começar grátis' : `Experimentar o ${p.name}`}</Link>
            </Button>
          )}
        />
        <p className="text-center text-xs text-muted-foreground">Preços com IVA incluído. Os serviços de contabilistas certificados parceiros são contratados e pagos diretamente ao contabilista.</p>
        <div className="mx-auto max-w-2xl">
          <Disclaimer />
        </div>
      </main>
    </div>
  );
}
