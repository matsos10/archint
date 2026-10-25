'use client';

import { useMemo, useState } from 'react';
import { compareIrsRegimes, type IrsIncomeType, type TaxParams } from '@somar/tax-engine';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatEur } from '@/lib/utils';

const toCents = (v: string) => Math.round((Number(v.replace(/\s/g, '').replace(',', '.')) || 0) * 100);

export function RegimeSimulator(props: { params: TaxParams; incomeType: IrsIncomeType; activityStartDate: string; hasEmploymentIncome: boolean }) {
  const [gross, setGross] = useState('30000');
  const [expenses, setExpenses] = useState('6000');
  const [accountant, setAccountant] = useState('1200');

  const result = useMemo(() => {
    const g = toCents(gross);
    const e = toCents(expenses);
    return compareIrsRegimes(
      {
        year: props.params.year,
        activityStartDate: props.activityStartDate,
        hasEmploymentIncome: props.hasEmploymentIncome,
        incomes: [{ type: props.incomeType, grossCents: g }],
        justifiedExpenses: { efaturaCents: e },
      },
      { deductibleExpensesCents: e, accountantCostCents: toCents(accountant) },
      props.params,
    );
  }, [gross, expenses, accountant, props]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Faturação anual (sem IVA)" htmlFor="sim-gross">
          <Input id="sim-gross" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} />
        </Field>
        <Field label="Despesas da atividade" htmlFor="sim-exp" hint="Com fatura, sem IVA dedutível.">
          <Input id="sim-exp" inputMode="decimal" value={expenses} onChange={(e) => setExpenses(e.target.value)} />
        </Field>
        <Field label="Custo do contabilista (ano)" htmlFor="sim-cc">
          <Input id="sim-cc" inputMode="decimal" value={accountant} onChange={(e) => setAccountant(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2" aria-live="polite">
        {(
          [
            ['Regime simplificado', result.simplified.netTaxCents, 'irs_simplificado', result.simplified.collectableCents],
            ['Contabilidade organizada', result.organized.netTaxCents + result.accountantCostCents, 'irs_contabilidade_organizada', result.organized.collectableCents],
          ] as const
        ).map(([label, value, code, collectable]) => (
          <div key={code} className={`grid gap-1 rounded-2xl border p-5 ${result.recommendation === code ? 'border-primary ring-1 ring-primary' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">{label}</span>
              {result.recommendation === code && <Badge>Mais vantajoso</Badge>}
            </div>
            <span className="text-2xl font-semibold tabular">{formatEur(value)}</span>
            <span className="text-xs text-muted-foreground">
              IRS{code === 'irs_contabilidade_organizada' ? ' + contabilista' : ''} · rendimento coletável {formatEur(collectable)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-sm">{result.explanation}</p>
      <p className="text-xs text-muted-foreground">
        Estimativa individual (sem quociente conjugal nem deduções pessoais), antes de retenções na fonte. A opção pela contabilidade organizada mantém-se durante 3 anos (art. 28.º CIRS).
      </p>
    </div>
  );
}
