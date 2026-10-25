import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { AlertTriangle, Download, ExternalLink } from 'lucide-react';
import { declarations, withTenant } from '@somar/db';
import type { DeclarationData } from '@somar/core';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DISCLAIMER } from '@/components/disclaimer';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { cn, formatDate, formatEur } from '@/lib/utils';
import { DeclarationActions } from './declaration-actions';

export const metadata: Metadata = { title: 'Declaração' };

const STATUS: Record<string, { label: string; variant: 'muted' | 'warning' | 'default' | 'success' }> = {
  draft: { label: 'Rascunho', variant: 'muted' },
  ready_for_review: { label: 'Por rever', variant: 'warning' },
  confirmed: { label: 'Confirmada — pronta a submeter', variant: 'default' },
  submitted: { label: 'Submetida', variant: 'success' },
  rejected: { label: 'Rejeitada', variant: 'muted' },
};

export default async function DeclarationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const ctx = await requireAccount();
  const [d] = await withTenant(getDb(), ctx.accountId, (tx) => tx.select().from(declarations).where(and(eq(declarations.id, id), eq(declarations.accountId, ctx.accountId))));
  if (!d) notFound();
  const data = d.data as unknown as DeclarationData;
  const st = STATUS[d.status]!;
  return (
    <div className="grid max-w-4xl gap-6">
      <div className="grid gap-2">
        <Link href="/app/impostos" className="text-sm text-primary hover:underline">← Impostos e prazos</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1>
          <Badge variant={st.variant}>{st.label}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Calculada a {formatDate(d.updatedAt)} com o motor fiscal v{d.engineVersion}
          {d.confirmedAt && <> · confirmada a {formatDate(d.confirmedAt)}</>}
          {d.submittedAt && <> · submetida a {formatDate(d.submittedAt)}{d.submissionRef ? ` (ref. ${d.submissionRef})` : ''}</>}
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumo">
        {data.summary.map((s) => (
          <Card key={s.label} className={cn(s.emphasis && 'border-primary/30 bg-accent/30')}>
            <CardContent className="grid gap-1 p-5">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <span className="text-xl font-semibold tabular">{s.label === 'Documentos' ? s.valueCents / 100 : formatEur(s.valueCents)}</span>
            </CardContent>
          </Card>
        ))}
      </section>

      {data.sections.map((sec) => (
        <Card key={sec.title}>
          <CardHeader><CardTitle>{sec.title}</CardTitle></CardHeader>
          <CardContent>
            {sec.fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem valores a declarar.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="w-28 pb-2 font-medium">Campo</th><th className="pb-2 font-medium">Descrição</th><th className="pb-2 text-right font-medium">Valor</th></tr>
                </thead>
                <tbody>
                  {sec.fields.map((f, i) => (
                    <tr key={`${f.code}-${i}`} className="border-t">
                      <td className="py-2.5 font-mono text-xs">{f.code}</td>
                      <td className="py-2.5">
                        {f.label}
                        {f.verify && <span className="ml-2 text-xs text-warning" title="Confirmar o número do campo no modelo oficial em vigor">● confirmar campo</span>}
                        {f.note && <span className="block text-xs text-muted-foreground">{f.note}</span>}
                      </td>
                      <td className="py-2.5 text-right font-medium tabular">{f.valueCents != null ? formatEur(f.valueCents) : f.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader><CardTitle>Como entregar</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <ol className="grid list-decimal gap-2 pl-5 text-sm">
            {data.steps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={data.portal.url} target="_blank" rel="noreferrer"><ExternalLink /> Abrir {data.portal.name}</a>
            </Button>
            {data.files.map((f, i) => (
              <Button key={f.name} variant="ghost" asChild>
                <a href={`/api/declaracoes/${d.id}/${i}`}><Download /> {f.name}</a>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {data.warnings.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle />
          <ul className="grid gap-1">{[...new Set(data.warnings)].map((w) => <li key={w}>{w}</li>)}</ul>
        </Alert>
      )}

      <Card>
        <CardContent className="grid gap-4 pt-6">
          <p className="text-sm text-muted-foreground">{DISCLAIMER}</p>
          <DeclarationActions id={d.id} status={d.status} />
        </CardContent>
      </Card>
    </div>
  );
}
