'use client';

import { useState, useTransition } from 'react';
import { Lightbulb, Sparkles } from 'lucide-react';
import type { Saving } from '@somar/core';
import { Button } from '@/components/ui/button';
import { formatEur } from '@/lib/utils';
import { aiSavingsAction } from './actions';

const KIND: Record<Saving['impactKind'], string> = { tax_saving: 'Poupança estimada', cash_flow: 'Liquidez (recebes/pagas mais cedo ou mais tarde)', informational: 'Recomendação' };

export function SavingsList({ initial, aiAvailable }: { initial: Saving[]; aiAvailable: boolean }) {
  const [list, setList] = useState(initial);
  const [pending, start] = useTransition();
  if (!list.length) return <p className="text-sm text-muted-foreground">Sem oportunidades identificadas com os dados atuais.</p>;
  return (
    <div className="grid gap-3">
      {list.map((s) => (
        <div key={s.action} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4">
          <div className="flex gap-3">
            <Lightbulb className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="grid gap-1">
              <span className="font-medium">{s.title}</span>
              <span className="text-sm text-muted-foreground">{s.rationale}</span>
              {s.aiGenerated && <span className="text-xs text-muted-foreground">Texto sugerido por IA; valor calculado pelo motor fiscal.</span>}
            </div>
          </div>
          {s.impactCents != null && (
            <div className="text-right">
              <span className="block font-semibold tabular">{formatEur(s.impactCents)}</span>
              <span className="text-xs text-muted-foreground">{KIND[s.impactKind]}</span>
            </div>
          )}
        </div>
      ))}
      {aiAvailable && !list.some((s) => s.aiGenerated) && (
        <div>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => setList(await aiSavingsAction()))}>
            <Sparkles /> {pending ? 'A analisar…' : 'Explicar estas oportunidades com IA'}
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Sugestões indicativas e legais. Confirma com um contabilista certificado antes de mudar de regime.</p>
    </div>
  );
}
