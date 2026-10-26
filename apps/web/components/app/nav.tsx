'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarClock, FileText, Home, Landmark, MessageCircle, Receipt, Settings, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export const NAV = [
  { href: '/app', label: 'Painel', icon: Home },
  { href: '/app/transacoes', label: 'Transações', icon: Landmark },
  { href: '/app/despesas', label: 'Despesas', icon: Receipt },
  { href: '/app/faturas', label: 'Faturação', icon: FileText },
  { href: '/app/impostos', label: 'Impostos', icon: CalendarClock },
  { href: '/app/assistente', label: 'Assistente', icon: MessageCircle },
  { href: '/app/contabilistas', label: 'Contabilista', icon: UserCheck },
  { href: '/app/definicoes', label: 'Definições', icon: Settings },
];

export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="grid gap-1">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/app' ? path === '/app' : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
              active ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Barra inferior em ecrãs pequenos (uso móvel/PWA). */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {NAV.filter((n) => !['/app/definicoes', '/app/assistente', '/app/contabilistas'].includes(n.href)).map(({ href, label, icon: Icon }) => {
        const active = href === '/app' ? path === '/app' : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={cn('flex flex-col items-center gap-1 py-2.5 text-[11px]', active ? 'text-primary' : 'text-muted-foreground')}>
            <Icon className="size-5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
