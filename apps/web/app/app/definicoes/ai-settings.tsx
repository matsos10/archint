'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { setAiEnabledAction } from './actions';

export function AiSettings({ enabled, available, usage }: { enabled: boolean; available: boolean; usage: { used: number; quota: number; accepted: number; modified: number; rejected: number } }) {
  const [on, setOn] = useState(enabled);
  const [msg, setMsg] = useState<string>();
  const [pending, start] = useTransition();
  const pct = Math.min(100, Math.round((usage.used / Math.max(1, usage.quota)) * 100));
  return (
    <div className="grid gap-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <span className="font-medium">{on ? 'IA ativa' : 'IA desativada'}</span>
          <span className="text-muted-foreground">
            A IA sugere categorias, lê recibos, explica declarações e responde a perguntas. Só são enviados os dados mínimos necessários e nunca submete nada: tu confirmas sempre.
          </span>
        </div>
        <Button
          variant={on ? 'outline' : 'default'}
          size="sm"
          disabled={pending}
          aria-pressed={on}
          onClick={() =>
            start(async () => {
              const r = await setAiEnabledAction(!on);
              if (r.ok) setOn(!on);
              setMsg(r.message ?? r.error);
            })
          }
        >
          {on ? 'Desativar IA' : 'Ativar IA'}
        </Button>
      </div>
      {!available && <p className="text-muted-foreground">O serviço de IA não está configurado neste servidor; a aplicação funciona sem IA.</p>}
      <div className="grid gap-2">
        <div className="flex justify-between">
          <span>Pedidos este mês</span>
          <span className="tabular">
            {usage.used} / {usage.quota}
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted" role="progressbar" aria-valuenow={usage.used} aria-valuemin={0} aria-valuemax={usage.quota} aria-label="Utilização da IA este mês">
          <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-muted-foreground">
          Sugestões aceites: {usage.accepted} · alteradas: {usage.modified} · rejeitadas: {usage.rejected}
        </span>
      </div>
      {msg && (
        <p role="status" className="text-muted-foreground">
          {msg}
        </p>
      )}
    </div>
  );
}
