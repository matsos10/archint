import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/session';
import { signOutAction } from '../(auth)/actions';

export default async function AccountantLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur sm:px-8">
        <Link href="/contabilista" className="flex items-center gap-3" aria-label="Portal do contabilista">
          <Logo /> <span className="hidden rounded-full bg-muted px-2.5 py-0.5 text-xs sm:inline">Contabilistas</span>
        </Link>
        <nav aria-label="Portal" className="flex items-center gap-1 text-sm">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/contabilista">Clientes</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/contabilista/perfil">Perfil</Link>
          </Button>
          <span className="hidden px-2 text-muted-foreground md:inline">{s.user.name}</span>
          <ThemeToggle />
          <form action={signOutAction}>
            <Button variant="ghost" size="icon" aria-label="Terminar sessão">
              <LogOut />
            </Button>
          </form>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
