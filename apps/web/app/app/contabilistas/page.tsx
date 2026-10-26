import type { Metadata } from 'next';
import { BadgeCheck, MapPin } from 'lucide-react';
import { DELEGATION_SCOPES, PARTNER_SPECIALTIES, accountantActivity, listAccountDelegations, listMarketplace, type DelegationScope } from '@somar/core';
import { withTenant } from '@somar/db';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { formatEur } from '@/lib/utils';
import { RequestForm, RevokeButton } from './forms';

export const metadata: Metadata = { title: 'Contabilista' };

const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' | 'destructive' }> = {
  requested: { label: 'Pedido enviado', variant: 'warning' },
  accepted: { label: 'Acesso ativo', variant: 'success' },
  declined: { label: 'Recusado', variant: 'muted' },
  revoked: { label: 'Terminado por ti', variant: 'muted' },
  completed: { label: 'Terminado', variant: 'muted' },
};

const ACTIONS: Record<string, string> = {
  'accountant.access': 'Entrou na conta',
  'delegation.accepted': 'Aceitou o pedido',
  'delegation.declined': 'Recusou o pedido',
  'delegation.ended': 'Terminou o acompanhamento',
  'declaration.prepared': 'Preparou uma declaração',
  'declaration.confirmed': 'Confirmou uma declaração',
  'declaration.submitted': 'Registou a submissão de uma declaração',
  'transaction.categorized': 'Categorizou uma transação',
  'transactions.imported': 'Importou um extrato',
  'receipt.confirmed': 'Confirmou um justificativo',
  'receipt.edited': 'Editou um justificativo',
  'obligation.status_changed': 'Atualizou o estado de uma obrigação',
  'file.downloaded': 'Descarregou um ficheiro',
  'declaration.file_downloaded': 'Descarregou um ficheiro de declaração',
};

export default async function AccountantsPage({ searchParams }: { searchParams: Promise<{ cidade?: string; especialidade?: string }> }) {
  const q = await searchParams;
  const ctx = await requireAccount();
  const canManage = ctx.role === 'owner' || ctx.role === 'admin';
  const { partners, delegations, activity } = await withTenant(getDb(), ctx, async (tx) => ({
    partners: await listMarketplace(tx, { city: q.cidade, specialty: q.especialidade }),
    delegations: await listAccountDelegations(tx, ctx.accountId),
    activity: await accountantActivity(tx, ctx.accountId),
  }));
  const open = delegations.filter((d) => d.d.status === 'requested' || d.d.status === 'accepted');
  const openPartners = new Set(open.map((d) => d.d.partnerId));

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contabilista certificado</h1>
        <p className="text-sm text-muted-foreground">Delega as declarações ou pede ajuda a um contabilista certificado (OCC). Tu decides o que ele pode ver e fazer.</p>
      </div>

      {open.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Acompanhamento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {open.map(({ d, partnerName, firmName, occNumber }) => (
              <div key={d.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4">
                <div className="grid gap-1 text-sm">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {partnerName} {firmName && <span className="font-normal text-muted-foreground">· {firmName}</span>}
                    <Badge variant={STATUS[d.status]!.variant}>{STATUS[d.status]!.label}</Badge>
                  </span>
                  <span className="text-muted-foreground">Contabilista certificado n.º {occNumber}</span>
                  <ul className="list-inside list-disc text-muted-foreground">
                    {(d.scopes as DelegationScope[]).map((s) => <li key={s}>{DELEGATION_SCOPES[s] ?? s}</li>)}
                  </ul>
                  {d.expiresAt && <span className="text-xs text-muted-foreground">Acesso válido até {d.expiresAt.toLocaleDateString('pt-PT')}</span>}
                </div>
                {canManage && <RevokeButton id={d.id} label={d.status === 'accepted' ? 'Terminar acesso' : 'Cancelar pedido'} />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Encontrar um contabilista</CardTitle>
          <CardDescription>Só aparecem contabilistas com inscrição na Ordem dos Contabilistas Certificados verificada pelo Somar.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <form className="flex flex-wrap items-end gap-3" role="search">
            <div className="grid gap-1.5">
              <label htmlFor="cidade" className="text-sm font-medium">Cidade</label>
              <Input id="cidade" name="cidade" defaultValue={q.cidade ?? ''} placeholder="Ex.: Lisboa" className="w-44" />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="especialidade" className="text-sm font-medium">Especialidade</label>
              <Select id="especialidade" name="especialidade" defaultValue={q.especialidade ?? ''} className="w-60">
                <option value="">Todas</option>
                {Object.entries(PARTNER_SPECIALTIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <Button type="submit" variant="outline" size="sm">Filtrar</Button>
          </form>
          {!canManage && <Alert>Só o titular ou um administrador da conta pode pedir acompanhamento.</Alert>}
          {partners.length === 0 && <p className="text-sm text-muted-foreground">Ainda não há contabilistas parceiros com estes critérios.</p>}
          <div className="grid gap-4 md:grid-cols-2">
            {partners.map((p) => (
              <section key={p.id} aria-labelledby={`p-${p.id}`} className="grid content-start gap-3 rounded-2xl border p-5">
                <div className="grid gap-1">
                  <h2 id={`p-${p.id}`} className="flex items-center gap-2 font-semibold">
                    {p.name} <BadgeCheck className="size-4 text-primary" aria-label="Inscrição verificada" />
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {p.firmName ? `${p.firmName} · ` : ''}OCC n.º {p.occNumber}
                  </span>
                  {p.city && (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="size-3.5" aria-hidden /> {p.city}
                    </span>
                  )}
                </div>
                {p.bio && <p className="text-sm">{p.bio}</p>}
                {p.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {p.specialties.map((s) => <Badge key={s} variant="muted">{PARTNER_SPECIALTIES[s as keyof typeof PARTNER_SPECIALTIES] ?? s}</Badge>)}
                  </div>
                )}
                {p.services.length > 0 && (
                  <ul className="grid gap-1 text-sm">
                    {p.services.map((s) => (
                      <li key={s.code} className="flex justify-between gap-3">
                        <span>{s.name}</span>
                        <span className="tabular text-muted-foreground">desde {formatEur(s.priceFromCents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {canManage && (openPartners.has(p.id) ? <p className="text-sm text-muted-foreground">Já tens um pedido ou acesso ativo com este contabilista.</p> : <RequestForm partnerId={p.id} services={p.services} />)}
              </section>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Os honorários são acordados e pagos diretamente ao contabilista; o Somar não é parte desse contrato. O contabilista certificado é responsável pelos atos que pratica na tua conta.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registo de acessos</CardTitle>
          <CardDescription>Todas as entradas e ações de contabilistas na tua conta.</CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem acessos registados.</p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Acessos e ações de contabilistas</caption>
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 font-normal">Data</th>
                  <th scope="col" className="py-2 font-normal">Contabilista</th>
                  <th scope="col" className="py-2 font-normal">Ação</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="py-2 tabular">{a.createdAt.toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="py-2">{a.actor}</td>
                    <td className="py-2">{ACTIONS[a.action] ?? a.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
