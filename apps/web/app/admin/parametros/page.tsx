import Link from 'next/link';
import { listTaxParamSets } from '@somar/core';
import { Badge } from '@/components/ui/badge';
import { getDb } from '@/lib/db';
import { formatDate } from '@/lib/utils';

export const metadata = { title: 'Parâmetros fiscais' };

export default async function ParamsPage() {
  const sets = await listTaxParamSets(getDb());
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Parâmetros fiscais</h1>
        <p className="text-muted-foreground">
          Escalões, coeficientes, taxas, limites e prazos por ano. Cada alteração cria uma nova versão; só a versão publicada mais recente é usada nos cálculos.
        </p>
      </div>
      <table className="w-full overflow-hidden rounded-2xl border text-sm">
        <thead className="bg-muted text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Ano</th>
            <th className="px-4 py-2.5 font-medium">Versão</th>
            <th className="px-4 py-2.5 font-medium">Estado</th>
            <th className="px-4 py-2.5 font-medium">Notas</th>
            <th className="px-4 py-2.5 font-medium">Publicada</th>
          </tr>
        </thead>
        <tbody>
          {sets.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="px-4 py-3 font-medium">
                <Link href={`/admin/parametros/${s.id}`} className="text-primary hover:underline">{s.year}</Link>
              </td>
              <td className="px-4 py-3">v{s.version}</td>
              <td className="px-4 py-3">
                <Badge variant={s.status === 'published' ? 'success' : s.status === 'draft' ? 'warning' : 'muted'}>
                  {{ published: 'Publicada', draft: 'Rascunho', archived: 'Arquivada' }[s.status]}
                </Badge>
              </td>
              <td className="max-w-80 truncate px-4 py-3 text-muted-foreground">{s.notes}</td>
              <td className="px-4 py-3">{s.publishedAt ? formatDate(s.publishedAt, 'short') : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
