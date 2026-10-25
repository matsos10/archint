'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { markAllReadAction } from './actions';

export function MarkAllRead() {
  const [pending, start] = useTransition();
  return <Button variant="ghost" size="sm" disabled={pending} onClick={() => start(() => markAllReadAction())}>Marcar todas como lidas</Button>;
}
