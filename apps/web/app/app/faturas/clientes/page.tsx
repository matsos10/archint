import type { Metadata } from 'next';
import { and, eq, isNull } from 'drizzle-orm';
import { clients, withTenant } from '@somar/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { ClientForm } from './client-form';

export const metadata: Metadata = { title: 'Clientes' };

export default async function ClientsPage() {
  const ctx = await requireAccount();
  const list = await withTenant(getDb(), ctx, (tx) => tx.select().from(clients).where(and(eq(clients.accountId, ctx.accountId), isNull(clients.archivedAt))).orderBy(clients.name));
  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
      <Card>
        <CardHeader><CardTitle>Novo cliente</CardTitle></CardHeader>
        <CardContent><ClientForm /></CardContent>
      </Card>
      {list.length > 0 && (
        <div className="grid gap-3">
          {list.map((c) => (
            <details key={c.id} className="rounded-2xl border bg-card px-5 py-4">
              <summary className="flex cursor-pointer flex-wrap justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-sm text-muted-foreground">{c.nif ? `NIF ${c.nif}` : 'Sem NIF'} · {c.isCompany ? (c.hasOrganizedAccounting ? 'Empresa (com retenção)' : 'Empresa') : 'Particular'} · {c.paymentTermsDays} dias</span>
              </summary>
              <div className="mt-4">
                <ClientForm id={c.id} initial={{ name: c.name, nif: c.nif ?? '', email: c.email ?? '', addressLine: c.addressLine ?? '', postalCode: c.postalCode ?? '', city: c.city ?? '', country: c.country, isCompany: c.isCompany, hasOrganizedAccounting: c.hasOrganizedAccounting, paymentTermsDays: c.paymentTermsDays }} />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
