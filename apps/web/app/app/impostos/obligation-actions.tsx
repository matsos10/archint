'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Check, FileSpreadsheet, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { prepareDeclarationAction, setObligationStatus } from './actions';

export function ObligationActions({ id, status, isPayment, declarative, declarationId }: { id: string; status: string; isPayment: boolean; declarative: boolean; declarationId: string | null }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  if (status === 'submitted' || status === 'paid') {
    return (
      <div className="flex gap-2">
        {declarationId && <Button variant="ghost" size="sm" asChild><Link href={`/app/impostos/declaracoes/${declarationId}`}>Ver</Link></Button>}
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => void (await setObligationStatus(id, 'upcoming')))}>
          <RotateCcw /> Desfazer
        </Button>
      </div>
    );
  }
  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {declarative &&
          (declarationId ? (
            <Button size="sm" asChild><Link href={`/app/impostos/declaracoes/${declarationId}`}><FileSpreadsheet /> Ver valores</Link></Button>
          ) : (
            <Button size="sm" disabled={pending} onClick={() => start(async () => { const r = await prepareDeclarationAction(id); if (r && 'error' in r && r.error) setError(r.error); })}>
              <FileSpreadsheet /> Preparar
            </Button>
          ))}
        <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => void (await setObligationStatus(id, isPayment ? 'paid' : 'submitted')))}>
          <Check /> {isPayment ? 'Já paguei' : 'Já entreguei'}
        </Button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
