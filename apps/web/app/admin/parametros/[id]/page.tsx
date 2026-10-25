import { notFound } from 'next/navigation';
import { getTaxParamSet } from '@somar/core';
import { paramsToVerify, parseTaxParams } from '@somar/tax-engine';
import { Badge } from '@/components/ui/badge';
import { getDb } from '@/lib/db';
import { DraftEditor, PublishButton } from './editor';

export default async function ParamSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const set = await getTaxParamSet(getDb(), id);
  if (!set) notFound();
  const parsed = parseTaxParams(set.params);
  const verify = paramsToVerify(parsed);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Parâmetros {set.year} · v{set.version}</h1>
        <Badge variant={set.status === 'published' ? 'success' : set.status === 'draft' ? 'warning' : 'muted'}>{set.status}</Badge>
        {set.status === 'draft' && <PublishButton id={set.id} />}
      </div>
      {verify.length > 0 && (
        <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="mb-2 font-medium">Valores a confirmar nas fontes oficiais</p>
          <ul className="grid gap-1">
            {verify.map((v) => (
              <li key={v.key}>
                <code className="text-xs">{v.key}</code> — {v.legal}
                {v.note && <span className="text-muted-foreground"> · {v.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <DraftEditor initial={JSON.stringify(set.params, null, 2)} />
    </div>
  );
}
