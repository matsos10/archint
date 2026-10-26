import type { Metadata } from 'next';
import { listPartnersForAdmin } from '@somar/core';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getDb } from '@/lib/db';
import { setVerifiedAction } from './actions';

export const metadata: Metadata = { title: 'Contabilistas parceiros' };

export default async function AdminPartnersPage() {
  const partners = await listPartnersForAdmin(getDb());
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contabilistas parceiros</h1>
        <p className="text-sm text-muted-foreground">Confirma a inscrição de cada contabilista na lista pública da Ordem dos Contabilistas Certificados antes de o verificar.</p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th scope="col" className="py-2 font-normal">Nome</th>
            <th scope="col" className="py-2 font-normal">OCC</th>
            <th scope="col" className="py-2 font-normal">Email</th>
            <th scope="col" className="py-2 font-normal">Estado</th>
            <th scope="col" className="py-2 font-normal"><span className="sr-only">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          {partners.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="py-2">{p.name}{p.firmName ? ` · ${p.firmName}` : ''}</td>
              <td className="py-2 tabular">{p.occNumber}</td>
              <td className="py-2">{p.email}</td>
              <td className="py-2">{p.verifiedAt ? <Badge variant="success">Verificado</Badge> : <Badge variant="warning">Por verificar</Badge>}</td>
              <td className="py-2 text-right">
                <form action={setVerifiedAction.bind(null, p.id, !p.verifiedAt)}>
                  <Button size="sm" variant={p.verifiedAt ? 'ghost' : 'default'}>{p.verifiedAt ? 'Retirar verificação' : 'Verificar'}</Button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {partners.length === 0 && <p className="text-sm text-muted-foreground">Sem pedidos de adesão.</p>}
    </div>
  );
}
