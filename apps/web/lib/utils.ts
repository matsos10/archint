import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
/** Formata cêntimos em euros (ex.: 123456 → "1234,56 €"). */
export function formatEur(cents: number | null | undefined): string {
  if (cents == null) return '—';
  return eur.format(cents / 100);
}

const dateFmt = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDateFmt = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
export function formatDate(iso: string | Date | null | undefined, style: 'long' | 'short' = 'long'): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso) : iso;
  return (style === 'long' ? dateFmt : shortDateFmt).format(d);
}
