'use client';

import { useTransition } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setObligationStatus } from './actions';

export function ObligationActions({ id, status, isPayment }: { id: string; status: string; isPayment: boolean }) {
  const [pending, start] = useTransition();
  if (status === 'submitted' || status === 'paid') {
    return (
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(async () => void (await setObligationStatus(id, 'upcoming')))}>
        <RotateCcw /> Desfazer
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => void (await setObligationStatus(id, isPayment ? 'paid' : 'submitted')))}>
      <Check /> {isPayment ? 'Já paguei' : 'Já entreguei'}
    </Button>
  );
}
