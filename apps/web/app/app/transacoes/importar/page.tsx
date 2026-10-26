import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { bankAccounts, withTenant } from '@somar/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { ImportForm } from './import-form';

export const metadata: Metadata = { title: 'Importar extrato' };

export default async function ImportPage() {
  const ctx = await requireAccount();
  const banks = await withTenant(getDb(), ctx, (tx) =>
    tx.select({ id: bankAccounts.id, name: bankAccounts.name, last4: bankAccounts.ibanLast4 }).from(bankAccounts).where(eq(bankAccounts.accountId, ctx.accountId)),
  );
  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Importar extrato</h1>
      <Card>
        <CardHeader>
          <CardTitle>Ficheiro do banco</CardTitle>
          <CardDescription>
            Exporta os movimentos no homebanking em CSV ou OFX. Reconhecemos os formatos habituais dos bancos portugueses; importar o mesmo ficheiro duas vezes não duplica movimentos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportForm banks={banks} />
        </CardContent>
      </Card>
    </div>
  );
}
