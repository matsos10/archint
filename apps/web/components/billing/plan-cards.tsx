import { Check } from 'lucide-react';
import { FEATURES } from '@somar/core';
import { Badge } from '@/components/ui/badge';
import { cn, formatEur } from '@/lib/utils';

export interface PlanView {
  code: string;
  name: string;
  priceMonthlyCents: number;
  priceYearlyCents: number;
  features: string[];
  aiMonthlyQuota: number;
}

const TAGLINE: Record<string, string> = {
  gratuito: 'Para começar: contabilidade e faturação.',
  plus: 'Para quem quer tudo automático e as declarações preparadas.',
  pro: 'Para sociedades e quem precisa de mais IA e apoio.',
};

/** Grelha de planos (página pública de preços e página do plano da conta). */
export function PlanCards({ plans, interval, currentCode, action }: { plans: PlanView[]; interval: 'month' | 'year'; currentCode?: string; action?: (p: PlanView) => React.ReactNode }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {plans.map((p) => {
        const price = interval === 'year' ? p.priceYearlyCents : p.priceMonthlyCents;
        const current = p.code === currentCode;
        return (
          <section key={p.code} aria-labelledby={`plan-${p.code}`} className={cn('flex flex-col gap-4 rounded-2xl border bg-card p-6', p.code === 'plus' && 'border-primary/50 shadow-sm')}>
            <div className="flex items-center justify-between gap-2">
              <h2 id={`plan-${p.code}`} className="text-lg font-semibold">
                {p.name}
              </h2>
              {current ? <Badge variant="success">Plano atual</Badge> : p.code === 'plus' ? <Badge>Recomendado</Badge> : null}
            </div>
            <p className="text-sm text-muted-foreground">{TAGLINE[p.code] ?? ''}</p>
            <p>
              <span className="text-3xl font-semibold tabular">{price ? formatEur(price) : '0 €'}</span>
              <span className="text-sm text-muted-foreground"> / {interval === 'year' ? 'ano' : 'mês'}</span>
              {interval === 'year' && p.priceMonthlyCents > 0 && (
                <span className="block text-xs text-muted-foreground">equivale a {formatEur(Math.round(p.priceYearlyCents / 12))} por mês</span>
              )}
            </p>
            <ul className="grid gap-2 text-sm">
              {Object.entries(FEATURES)
                .filter(([k]) => p.features.includes(k))
                .map(([k, label]) => (
                  <li key={k} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {label}
                  </li>
                ))}
              <li className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> Assistente e sugestões de IA: {p.aiMonthlyQuota} pedidos/mês
              </li>
            </ul>
            <div className="mt-auto pt-2">{action?.(p)}</div>
          </section>
        );
      })}
    </div>
  );
}
