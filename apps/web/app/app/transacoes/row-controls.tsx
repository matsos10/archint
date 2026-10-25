'use client';

import { useState, useTransition } from 'react';
import { Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, Sparkles } from 'lucide-react';
import { aiSuggestCategoriesAction, confirmAiAction, resolveDuplicateAction, setCategoryAction } from './actions';

export interface CategoryOption {
  id: string;
  name: string;
  kind: string;
}

const KIND_LABEL: Record<string, string> = {
  income: 'Receitas',
  expense: 'Despesas da atividade',
  tax: 'Impostos e contribuições',
  personal: 'Pessoal',
  transfer: 'Transferências',
  other: 'Outros',
};

export function CategorySelect({ transactionId, value, options, label }: { transactionId: string; value: string | null; options: CategoryOption[]; label: string }) {
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState(value ?? '');
  const [learned, setLearned] = useState<string | null>(null);
  const groups = Object.keys(KIND_LABEL).map((k) => [k, options.filter((o) => o.kind === k)] as const).filter(([, l]) => l.length);
  return (
    <div className="grid gap-1">
      <Select
        aria-label={`Categoria de ${label}`}
        value={current}
        disabled={pending}
        className="h-9 min-w-52 text-sm"
        onChange={(e) => {
          const id = e.target.value;
          setCurrent(id);
          start(async () => {
            const r = await setCategoryAction(transactionId, id);
            setLearned(r.learnedPattern && r.propagated > 0 ? `Aplicado também a ${r.propagated} movimento(s) semelhante(s).` : null);
          });
        }}
      >
        <option value="" disabled>
          Escolher categoria…
        </option>
        {groups.map(([k, list]) => (
          <optgroup key={k} label={KIND_LABEL[k]}>
            {list.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
      {learned && <span className="text-xs text-success">{learned}</span>}
    </div>
  );
}

export function DuplicateControls({ transactionId }: { transactionId: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(() => resolveDuplicateAction(transactionId, 'ignore'))}>
        É duplicado
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => resolveDuplicateAction(transactionId, 'keep'))}>
        Não é
      </Button>
    </div>
  );
}

export function ConfirmAiButton({ transactionId, confidence }: { transactionId: string; confidence: number | null }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => confirmAiAction(transactionId))} title="Aceitar a sugestão da IA">
      <Check /> Aceitar{confidence != null ? ` (${Math.round(confidence * 100)}%)` : ''}
    </Button>
  );
}

export function AiSuggestButton({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string>();
  const labels: Record<string, string> = { disabled: 'A IA está desligada ou indisponível.', rate_limited: 'Atingiste o limite de pedidos de IA do teu plano.', error: 'A IA não respondeu. Tenta mais tarde.', timeout: 'A IA demorou demasiado. Tenta mais tarde.', invalid_output: 'A IA não encontrou sugestões seguras.' };
  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => { const r = await aiSuggestCategoriesAction(); setMsg(r.applied ? `${r.applied} sugestão(ões) para rever.` : labels[r.status] ?? 'Sem sugestões.'); })}>
        <Sparkles /> {pending ? 'A pensar…' : `Sugerir categorias com IA (${count})`}
      </Button>
      {msg && <span className="text-sm text-muted-foreground" role="status">{msg}</span>}
    </div>
  );
}
