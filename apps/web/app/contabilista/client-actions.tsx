'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { endAction, openClientAction, respondAction } from './actions';

export function RespondButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const run = (accept: boolean) =>
    start(async () => {
      const r = await respondAction(id, accept);
      if (r && 'error' in r && r.error) setError(r.error);
    });
  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(true)}>Aceitar</Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(false)}>Recusar</Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function ClientButtons({ accountId, delegationId }: { accountId: string; delegationId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await openClientAction(accountId); if (r?.error) setError(r.error); })}>
          Abrir conta
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (confirm('Terminar o acompanhamento deste cliente? Deixas de ter acesso à conta.')) start(async () => { const r = await endAction(delegationId); if (r && 'error' in r && r.error) setError(r.error); });
          }}
        >
          Terminar
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
