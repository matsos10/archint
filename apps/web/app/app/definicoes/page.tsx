import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { accounts, withTenant } from '@somar/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { ProfileForm } from './profile-form';
import { TwoFactorSettings } from './two-factor';
import { BrandingForm } from './branding-form';
import { aiUsageThisMonth, decryptString } from '@somar/core';
import { globalLlm } from '@/lib/ai';
import { AiSettings } from './ai-settings';

export const metadata: Metadata = { title: 'Definições' };

export default async function SettingsPage() {
  const ctx = await requireAccount();
  const { account, usage } = await withTenant(getDb(), ctx.accountId, async (tx) => {
    const [a] = await tx.select().from(accounts).where(eq(accounts.id, ctx.accountId));
    return { account: a!, usage: await aiUsageThisMonth(tx, ctx.accountId) };
  });
  return (
    <div className="grid max-w-3xl gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Definições</h1>
      <Card>
        <CardHeader>
          <CardTitle>Dados da atividade</CardTitle>
          <CardDescription>Aparecem nas tuas faturas e determinam os teus impostos.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            account={{
              name: account.name,
              legalForm: account.legalForm,
              nif: account.nif ?? '',
              vatRegime: account.vatRegime,
              incomeTaxRegime: account.incomeTaxRegime,
              activityStartDate: account.activityStartDate,
              cae: account.cae ?? '',
              cirsActivityCode: account.cirsActivityCode ?? '',
              hasEmploymentIncome: account.hasEmploymentIncome,
              addressLine: account.addressLine ?? '',
              postalCode: account.postalCode ?? '',
              city: account.city ?? '',
              email: account.email ?? '',
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Faturação</CardTitle>
          <CardDescription>A imagem dos teus orçamentos e faturas, e os dados de pagamento.</CardDescription>
        </CardHeader>
        <CardContent>
          <BrandingForm
            brandColor={account.brandColor ?? '#3a4fc4'}
            iban={account.iban ? safeDecrypt(account.iban) : ''}
            hasLogo={!!account.logoFileId}
            withholdingExempt={account.withholdingExempt}
            individual={account.legalForm === 'trabalhador_independente' || account.legalForm === 'eni'}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Inteligência artificial</CardTitle>
          <CardDescription>A IA propõe, o motor fiscal valida, tu confirmas.</CardDescription>
        </CardHeader>
        <CardContent>
          <AiSettings enabled={account.aiEnabled} available={!!globalLlm()} usage={usage} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Segurança</CardTitle>
          <CardDescription>Protege o acesso aos teus dados financeiros com um segundo fator.</CardDescription>
        </CardHeader>
        <CardContent>
          <TwoFactorSettings enabled={ctx.session.user.totpEnabled} />
        </CardContent>
      </Card>
    </div>
  );
}

function safeDecrypt(v: string) {
  try {
    return decryptString(v, undefined, 'iban');
  } catch {
    return '';
  }
}
