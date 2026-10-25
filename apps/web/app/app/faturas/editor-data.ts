import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { accounts, clients, withTenant } from '@somar/db';
import { isIndividualAccount } from '@somar/core';
import { getDb } from '@/lib/db';
import { invoicingDeps } from '@/lib/invoicing';

export async function editorData(accountId: string) {
  const deps = await invoicingDeps();
  const { account, list } = await withTenant(getDb(), accountId, async (tx) => ({
    account: (await tx.select().from(accounts).where(eq(accounts.id, accountId)))[0]!,
    list: await tx.select().from(clients).where(and(eq(clients.accountId, accountId), isNull(clients.archivedAt))).orderBy(clients.name),
  }));
  return {
    params: deps.params,
    today: deps.today,
    providerLegal: deps.provider.legallyValid,
    account,
    context: {
      region: account.taxRegion,
      vatRegime: account.vatRegime,
      incomeType: account.mainIncomeType,
      providerIsIndividual: isIndividualAccount(account),
      providerWithholdingExempt: account.withholdingExempt,
    },
    clients: list.map((c) => ({ id: c.id, name: c.name, isCompany: c.isCompany, hasOrganizedAccounting: c.hasOrganizedAccounting, paymentTermsDays: c.paymentTermsDays })),
  };
}
