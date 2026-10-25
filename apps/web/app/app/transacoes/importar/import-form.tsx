'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Field } from '@/components/ui/label';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormError, SubmitButton } from '@/components/submit-button';
import { importStatementAction, type ImportState } from '../actions';

export function ImportForm({ banks }: { banks: { id: string; name: string; last4: string | null }[] }) {
  const [state, action] = useActionState<ImportState, FormData>(importStatementAction, {});
  const [bank, setBank] = useState(banks[0]?.id ?? 'new');
  if (state.result) {
    const r = state.result;
    return (
      <div className="grid gap-4" role="status">
        <p className="flex items-center gap-2 font-medium text-success">
          <CheckCircle2 className="size-5" /> Extrato importado
        </p>
        <ul className="grid gap-1 text-sm">
          <li>{r.imported} movimento(s) novos</li>
          {r.skipped > 0 && <li>{r.skipped} já existiam e foram ignorados</li>}
          <li>{r.categorized} categorizados automaticamente</li>
          {r.receiptsMatched > 0 && <li>{r.receiptsMatched} justificativo(s) associados</li>}
          {r.duplicates > 0 && <li className="text-warning">{r.duplicates} possível(eis) duplicado(s) para rever</li>}
          {r.warnings.map((w) => (
            <li key={w} className="text-muted-foreground">
              {w}
            </li>
          ))}
        </ul>
        <div>
          <Button asChild>
            <Link href="/app/transacoes?filtro=rever">Rever movimentos</Link>
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-5">
      <FormError message={state.error} />
      <Field label="Conta bancária" htmlFor="bankAccountId">
        <Select id="bankAccountId" name="bankAccountId" value={bank} onChange={(e) => setBank(e.target.value)}>
          {banks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {b.last4 ? ` (…${b.last4})` : ''}
            </option>
          ))}
          <option value="new">+ Nova conta bancária</option>
        </Select>
      </Field>
      {bank === 'new' && (
        <Field label="Nome da conta" htmlFor="bankName">
          <Input id="bankName" name="bankName" placeholder="Ex.: Conta à ordem — Banco X" required />
        </Field>
      )}
      <Field label="Ficheiro" htmlFor="file" hint="CSV ou OFX, até 5 MB.">
        <Input id="file" name="file" type="file" accept=".csv,.txt,.ofx,.qfx,text/csv" required className="py-2" />
      </Field>
      <div>
        <SubmitButton pendingText="A importar…">Importar</SubmitButton>
      </div>
    </form>
  );
}
