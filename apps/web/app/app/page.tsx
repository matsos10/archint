import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { accounts, withTenant } from '@somar/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getDb } from '@/lib/db';
import { requireAccount } from '@/lib/session';
import { formatDate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Painel' };

const LEGAL_FORM_LABEL: Record<string, string> = {
  trabalhador_independente: 'Trabalhador independente',
  eni: 'Empresário em nome individual',
  unipessoal_lda: 'Sociedade unipessoal',
  lda: 'Sociedade por quotas',
};
const VAT_LABEL: Record<string, string> = {
  normal_mensal: 'IVA mensal',
  normal_trimestral: 'IVA trimestral',
  isento_art53: 'Isento de IVA (art. 53.º)',
  isento_art9: 'Isento de IVA (art. 9.º)',
};
const INCOME_LABEL: Record<string, string> = {
  irs_simplificado: 'IRS — regime simplificado',
  irs_contabilidade_organizada: 'IRS — contabilidade organizada',
  irc_geral: 'IRC',
};

export default async function DashboardPage() {
  const ctx = await requireAccount();
  const account = await withTenant(getDb(), ctx.accountId, async (tx) => {
    const [a] = await tx.select().from(accounts).where(eq(accounts.id, ctx.accountId));
    return a!;
  });
  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{account.name}</h1>
        <p className="text-muted-foreground">Atividade desde {formatDate(account.activityStartDate)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge>{LEGAL_FORM_LABEL[account.legalForm]}</Badge>
        <Badge variant="muted">{VAT_LABEL[account.vatRegime]}</Badge>
        <Badge variant="muted">{INCOME_LABEL[account.incomeTaxRegime]}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>A tua conta está pronta</CardTitle>
          <CardDescription>Próximos passos: ligar o banco, emitir a primeira fatura e ver o calendário fiscal.</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
