import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getAssistantThread, listAssistantThreads, llmForAccount } from '@somar/core';
import { withTenant } from '@somar/db';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { globalLlm } from '@/lib/ai';
import { cn } from '@/lib/utils';
import { Chat } from './chat';

export const metadata: Metadata = { title: 'Assistente' };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const ctx = await requireAccount();
  const me = { accountId: ctx.accountId, userId: ctx.session.user.id };
  const { threads, current, available } = await withTenant(getDb(), ctx, async (tx) => ({
    threads: await listAssistantThreads(tx, me),
    current: c ? await getAssistantThread(tx, me, c) : null,
    available: !!(await llmForAccount(tx, ctx.accountId, globalLlm())),
  }));
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assistente</h1>
          <p className="text-sm text-muted-foreground">Respostas informativas com base na tua contabilidade. Não substitui um contabilista certificado.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/app/assistente">
            <Plus /> Nova conversa
          </Link>
        </Button>
      </div>
      {!available && (
        <Alert>
          <span>
            O assistente de IA está desligado ou indisponível. Podes ativá-lo em <Link href="/app/definicoes" className="underline">Definições</Link>; sem IA, as perguntas recebem uma resposta padrão.
          </span>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Conversas" className="grid content-start gap-1">
          {threads.length === 0 && <p className="text-sm text-muted-foreground">Ainda não tens conversas.</p>}
          {threads.map((t) => (
            <Link
              key={t.id}
              href={`/app/assistente?c=${t.id}`}
              aria-current={t.id === c ? 'page' : undefined}
              className={cn('truncate rounded-xl px-3 py-2 text-sm', t.id === c ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-muted')}
            >
              {t.title ?? 'Conversa'}
            </Link>
          ))}
        </nav>
        <Card>
          <CardContent className="pt-6">
            <Chat key={current?.thread.id ?? 'new'} threadId={current?.thread.id} initial={current?.messages ?? []} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
