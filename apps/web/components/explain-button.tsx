'use client';

import { useState, useTransition } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ExplainButton({ action }: { action: () => Promise<{ explanation: { title: string; paragraphs: string[] }; aiGenerated: boolean } | null> }) {
  const [pending, start] = useTransition();
  const [r, setR] = useState<Awaited<ReturnType<typeof action>>>();
  return (
    <div className="grid gap-3">
      {!r && (
        <div>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => setR(await action()))}>
            <Sparkles /> {pending ? 'A preparar…' : 'Explica-me em linguagem simples'}
          </Button>
        </div>
      )}
      {r && (
        <div className="grid gap-2 rounded-2xl bg-accent/40 p-5 text-sm" aria-live="polite">
          <p className="font-medium">{r.explanation.title}</p>
          {r.explanation.paragraphs.map((p) => <p key={p}>{p}</p>)}
          <p className="text-xs text-muted-foreground">
            {r.aiGenerated ? 'Explicação gerada por IA a partir dos valores calculados pelo motor fiscal (os números foram verificados).' : 'Resumo automático dos valores calculados (IA indisponível).'}
          </p>
        </div>
      )}
    </div>
  );
}
