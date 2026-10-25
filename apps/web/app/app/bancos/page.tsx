import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { Landmark, ShieldCheck } from 'lucide-react';
import { bankAccounts, bankConnections, withTenant } from '@somar/db';
import { defaultAggregator } from '@somar/core';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SubmitButton } from '@/components/submit-button';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { formatDate, formatEur } from '@/lib/utils';
import { connectBankAction } from './actions';

export const metadata: Metadata = { title: 'Bancos' };

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }> = {
  linked: { label: 'Ligado', variant: 'success' },
  pending: { label: 'A aguardar autorização', variant: 'warning' },
  expired: { label: 'Consentimento expirado', variant: 'destructive' },
  revoked: { label: 'Revogado', variant: 'muted' },
  error: { label: 'Erro', variant: 'destructive' },
};

export default async function BanksPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireAccount();
  const agg = defaultAggregator();
  const institutions = agg ? await agg.listInstitutions('PT').catch(() => []) : [];
  const { conns, accs } = await withTenant(getDb(), ctx.accountId, async (tx) => ({
    conns: await tx.select().from(bankConnections).where(eq(bankConnections.accountId, ctx.accountId)),
    accs: await tx.select().from(bankAccounts).where(eq(bankAccounts.accountId, ctx.accountId)),
  }));
  return (
    <div className="grid max-w-3xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Bancos</h1>
        <p className="text-muted-foreground">Os movimentos chegam sozinhos, várias vezes por dia.</p>
      </div>
      {sp.ok && <Alert variant="success">Banco ligado ({sp.ok} conta(s)). A primeira sincronização está a decorrer.</Alert>}
      {sp.erro && <Alert variant="destructive">Não foi possível concluir a ligação ao banco. Tenta novamente.</Alert>}

      {accs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>As tuas contas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {accs.map((a) => {
              const c = conns.find((x) => x.id === a.connectionId);
              const s = c ? STATUS[c.status] : undefined;
              return (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
                  <div className="grid gap-0.5">
                    <span className="font-medium">
                      {a.name} {a.ibanLast4 && <span className="text-muted-foreground">…{a.ibanLast4}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c ? `${c.institutionName ?? 'Open banking'} · última sincronização ${c.lastSyncedAt ? formatDate(c.lastSyncedAt) : '—'}` : 'Importação manual (CSV/OFX)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {a.balanceCents != null && <span className="font-medium tabular">{formatEur(a.balanceCents)}</span>}
                    {s && <Badge variant={s.variant}>{s.label}</Badge>}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ligar um banco</CardTitle>
          <CardDescription>
            Usamos um agregador licenciado (PSD2). Autenticas-te no site do teu banco: nunca vemos nem guardamos as tuas credenciais, e o acesso é só de leitura, por 90 dias renováveis.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!agg ? (
            <Alert variant="warning">A ligação automática a bancos ainda não está disponível. Podes importar extratos em CSV ou OFX.</Alert>
          ) : institutions.length === 0 ? (
            <Alert variant="warning">Não foi possível obter a lista de bancos. Tenta mais tarde.</Alert>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {institutions.slice(0, 40).map((i) => (
                <form key={i.id} action={connectBankAction}>
                  <input type="hidden" name="institutionId" value={i.id} />
                  <input type="hidden" name="institutionName" value={i.name} />
                  <SubmitButton variant="outline" className="w-full justify-start rounded-xl">
                    <Landmark /> {i.name}
                  </SubmitButton>
                </form>
              ))}
            </div>
          )}
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4" /> Os serviços bancários são prestados por entidades licenciadas; o Somar não é um banco.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
