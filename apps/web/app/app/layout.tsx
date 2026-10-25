import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { eq } from 'drizzle-orm';
import { accounts, withTenant } from '@somar/db';
import { Logo } from '@/components/brand/logo';
import { BottomNav, SideNav } from '@/components/app/nav';
import { ThemeToggle } from '@/components/theme-toggle';
import { Disclaimer } from '@/components/disclaimer';
import { Button } from '@/components/ui/button';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { signOutAction } from '../(auth)/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireAccount();
  const account = await withTenant(getDb(), ctx.accountId, async (tx) => {
    const [a] = await tx.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, ctx.accountId));
    return a;
  });
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r bg-card/50 lg:flex lg:flex-col lg:gap-8 lg:px-4 lg:py-6">
        <Link href="/app" className="px-2" aria-label="Somar, painel">
          <Logo />
        </Link>
        <div className="rounded-xl bg-muted px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Conta</p>
          <p className="truncate text-sm font-medium">{account?.name}</p>
        </div>
        <SideNav />
        <div className="mt-auto grid gap-4 px-2">
          <Disclaimer />
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur sm:px-8">
          <Link href="/app" className="lg:hidden" aria-label="Somar, painel">
            <Logo />
          </Link>
          <span className="hidden text-sm text-muted-foreground lg:block">Olá, {ctx.session.user.name.split(' ')[0]}</span>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action={signOutAction}>
              <Button variant="ghost" size="icon" aria-label="Terminar sessão">
                <LogOut />
              </Button>
            </form>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-28 sm:px-8 lg:pb-12">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
