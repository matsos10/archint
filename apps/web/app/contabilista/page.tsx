import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DELEGATION_SCOPES, OBLIGATION_LABELS, accountantPortal, listUserAccounts, type DelegationScope } from '@somar/core';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { ClientButtons, RespondButtons } from './client-actions';
import { openOwnAccountAction } from './actions';

export const metadata: Metadata = { title: 'Portal do contabilista' };

const LEGAL: Record<string, string> = { trabalhador_independente: 'Trabalhador independente', eni: 'ENI', unipessoal_lda: 'Unipessoal Lda.', lda: 'Lda.' };
const fmt = (d: string) => d.split('-').reverse().join('/');

export default async function AccountantPortalPage() {
  const s = await requireUser();
  const portal = await accountantPortal(getDb(), s.user.id);
  if (!portal) redirect('/contabilista/perfil');
  const own = (await listUserAccounts(getDb(), s.user.id)).filter((a) => a.role !== 'accountant');
  const { partner, requests, clients } = portal;

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Os teus clientes</h1>
          <p className="text-sm text-muted-foreground">
            {partner.name} · OCC n.º {partner.occNumber}
          </p>
        </div>
        {own.map((a) => (
          <form key={a.id} action={openOwnAccountAction.bind(null, a.id)}>
            <Button variant="outline" size="sm">Ir para a minha conta ({a.name})</Button>
          </form>
        ))}
      </div>

      {!partner.verifiedAt && (
        <Alert variant="warning">
          O teu perfil aguarda verificação da inscrição na Ordem dos Contabilistas Certificados. Até lá não apareces no diretório nem podes aceitar pedidos.
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pedidos de acompanhamento</CardTitle>
          <CardDescription>Antes de aceitares só vês a identificação e o enquadramento do cliente.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {requests.length === 0 && <p className="text-sm text-muted-foreground">Sem pedidos pendentes.</p>}
          {requests.map((r) => (
            <div key={r.d.id} className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border p-4">
              <div className="grid gap-1 text-sm">
                <span className="font-medium">{r.accountName}</span>
                <span className="text-muted-foreground">
                  {LEGAL[r.legalForm] ?? r.legalForm} · IVA {r.vatRegime.replaceAll('_', ' ')} · {r.incomeTaxRegime.replaceAll('_', ' ')}
                </span>
                {r.d.serviceCode && <span>Serviço: {partner.services.find((x) => x.code === r.d.serviceCode)?.name ?? r.d.serviceCode}</span>}
                <ul className="list-inside list-disc text-muted-foreground">
                  {(r.d.scopes as DelegationScope[]).map((sc) => <li key={sc}>{DELEGATION_SCOPES[sc] ?? sc}</li>)}
                </ul>
                {r.d.message && <blockquote className="border-l-2 pl-3 italic">{r.d.message}</blockquote>}
              </div>
              {partner.verifiedAt && <RespondButtons id={r.d.id} />}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clientes ativos</CardTitle>
          <CardDescription>Cada entrada numa conta fica registada e é visível para o cliente.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {clients.length === 0 && <p className="text-sm text-muted-foreground">Ainda não tens clientes ativos.</p>}
          {clients.map((c) => (
            <div key={c.d.id} className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-[1fr_auto]">
              <div className="grid gap-2 text-sm">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {c.accountName}
                  {c.toReview > 0 && <Badge variant="warning">{c.toReview} declaração(ões) por rever</Badge>}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(c.d.scopes as DelegationScope[]).map((sc) => <Badge key={sc} variant="muted">{sc === 'read' ? 'Consulta' : sc === 'accounting' ? 'Contabilidade' : 'Declarações'}</Badge>)}
                </div>
                {c.next.length > 0 ? (
                  <ul className="grid gap-0.5 text-muted-foreground">
                    {c.next.map((o) => (
                      <li key={`${o.type}-${o.dueDate}`}>
                        <span className="tabular">{fmt(o.dueDate)}</span> · {OBLIGATION_LABELS[o.type as keyof typeof OBLIGATION_LABELS] ?? o.type}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">Sem prazos nos próximos 45 dias.</span>
                )}
                {c.d.expiresAt && <span className="text-xs text-muted-foreground">Acesso até {c.d.expiresAt.toLocaleDateString('pt-PT')}</span>}
              </div>
              <ClientButtons accountId={c.d.accountId} delegationId={c.d.id} />
            </div>
          ))}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Precisas de alterar o teu perfil ou serviços? <Link href="/contabilista/perfil" className="underline">Editar perfil</Link>.
      </p>
    </div>
  );
}
