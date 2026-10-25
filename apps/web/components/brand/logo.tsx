import { cn } from '@/lib/utils';

/** Logótipo provisório: um "+" dentro de um círculo (somar), sem relação com outras marcas. */
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <svg viewBox="0 0 32 32" aria-hidden className="size-7">
        <rect width="32" height="32" rx="10" className="fill-primary" />
        <path d="M16 9v14M9 16h14" strokeWidth="3.2" strokeLinecap="round" className="stroke-primary-foreground" />
      </svg>
      {withText && <span className="text-lg">somar</span>}
    </span>
  );
}
