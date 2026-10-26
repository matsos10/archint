import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { Bell } from 'lucide-react';
import { notifications, withTenant } from '@somar/db';
import { Card, CardContent } from '@/components/ui/card';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { cn, formatDate } from '@/lib/utils';
import { MarkAllRead } from './mark-read';

export const metadata: Metadata = { title: 'Notificações' };

export default async function NotificationsPage() {
  const ctx = await requireAccount();
  const list = await withTenant(getDb(), ctx, (tx) =>
    tx.select().from(notifications).where(eq(notifications.accountId, ctx.accountId)).orderBy(desc(notifications.createdAt)).limit(100),
  );
  const unread = list.filter((n) => !n.readAt).length;
  return (
    <div className="grid max-w-3xl gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Notificações</h1>
        {unread > 0 && <MarkAllRead />}
      </div>
      {list.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><Bell className="size-8 text-muted-foreground" /><p className="font-medium">Sem notificações</p><p className="text-sm text-muted-foreground">Avisamos-te aqui (e por email) antes de cada prazo.</p></CardContent></Card>
      ) : (
        <ul className="grid gap-px overflow-hidden rounded-2xl border bg-border">
          {list.map((n) => (
            <li key={n.id} className={cn('bg-card', !n.readAt && 'bg-accent/30')}>
              <Link href={n.link ?? '/app'} className="grid gap-1 px-5 py-4 hover:bg-muted/40">
                <span className="flex items-center gap-2 font-medium">{!n.readAt && <span className="size-2 rounded-full bg-primary" aria-label="Não lida" />}{n.title}</span>
                {n.body && <span className="text-sm text-muted-foreground">{n.body}</span>}
                <span className="text-xs text-muted-foreground">{formatDate(n.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
