import { and, eq } from 'drizzle-orm';
import { bankAccounts, bankConnections, withTenant, type Db } from '@somar/db';
import { audit } from '../audit';
import { decryptString, encryptString } from '../crypto';
import { AppError } from '../errors';
import { enqueueJob } from '../jobs';
import type { BankAggregator } from './aggregator';
import { importTransactions, type ImportResult } from './import';

const aad = (connectionId: string) => `bank_connection:${connectionId}`;

/** Inicia a ligação a um banco: devolve o URL do agregador onde o utilizador se autentica no banco. */
export async function startBankLink(
  db: Db,
  agg: BankAggregator,
  ctx: { accountId: string; userId: string },
  input: { institutionId: string; institutionName?: string; redirectUrl: string },
) {
  return withTenant(db, ctx, async (tx) => {
    const [conn] = await tx
      .insert(bankConnections)
      .values({ accountId: ctx.accountId, provider: agg.name, institutionId: input.institutionId, institutionName: input.institutionName, status: 'pending' })
      .returning();
    const redirect = new URL(input.redirectUrl);
    redirect.searchParams.set('connection', conn!.id);
    const { externalRef, link } = await agg.createLink({ institutionId: input.institutionId, redirectUrl: redirect.toString(), reference: conn!.id });
    await tx.update(bankConnections).set({ externalRefEnc: encryptString(externalRef, undefined, aad(conn!.id)) }).where(eq(bankConnections.id, conn!.id));
    await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'bank.link_started', entityType: 'bank_connection', entityId: conn!.id, data: { institution: input.institutionId } });
    return { connectionId: conn!.id, link };
  });
}

/** Regresso do banco: confirma o consentimento, cria as contas bancárias e agenda a sincronização. */
export async function completeBankLink(db: Db, agg: BankAggregator, ctx: { accountId: string; userId?: string }, connectionId: string) {
  return withTenant(db, ctx, async (tx) => {
    const [conn] = await tx.select().from(bankConnections).where(and(eq(bankConnections.id, connectionId), eq(bankConnections.accountId, ctx.accountId)));
    if (!conn?.externalRefEnc) throw new AppError('not_found', 'Ligação bancária não encontrada.', 404);
    const status = await agg.getLinkStatus(decryptString(conn.externalRefEnc, undefined, aad(conn.id)));
    if (status.status !== 'linked') {
      await tx.update(bankConnections).set({ status: status.status === 'pending' ? 'pending' : 'error', lastError: `Estado: ${status.status}` }).where(eq(bankConnections.id, conn.id));
      return { status: status.status, accounts: 0 };
    }
    for (const extId of status.accountIds) {
      const a = await agg.getAccount(extId);
      const [existing] = await tx.select({ id: bankAccounts.id }).from(bankAccounts).where(and(eq(bankAccounts.accountId, ctx.accountId), eq(bankAccounts.externalId, extId)));
      const values = {
        name: a.name || conn.institutionName || 'Conta bancária',
        ibanEnc: a.iban ? encryptString(a.iban, undefined, 'iban') : null,
        ibanLast4: a.iban?.slice(-4) ?? null,
        currency: a.currency,
        balanceCents: a.balanceCents ?? null,
        balanceAt: a.balanceCents != null ? new Date() : null,
      };
      if (existing) await tx.update(bankAccounts).set({ ...values, connectionId: conn.id }).where(eq(bankAccounts.id, existing.id));
      else await tx.insert(bankAccounts).values({ accountId: ctx.accountId, connectionId: conn.id, source: 'open_banking', externalId: extId, ...values });
    }
    await tx
      .update(bankConnections)
      .set({ status: 'linked', lastError: null, consentExpiresAt: status.consentExpiresAt ?? new Date(Date.now() + 90 * 86_400_000) })
      .where(eq(bankConnections.id, conn.id));
    await enqueueJob(tx, 'bank.sync', { connectionId: conn.id }, { accountId: ctx.accountId, dedupeKey: `bank.sync:${conn.id}:initial` });
    await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'bank.linked', entityType: 'bank_connection', entityId: conn.id, data: { accounts: status.accountIds.length } });
    return { status: 'linked' as const, accounts: status.accountIds.length };
  });
}

/** Sincroniza todas as contas de uma ligação (chamado pelo worker). */
export async function syncBankConnection(db: Db, agg: BankAggregator, accountId: string, connectionId: string): Promise<ImportResult[]> {
  try {
    return await syncInTx(db, agg, accountId, connectionId);
  } catch (e) {
    // A transação de sincronização foi revertida; regista o erro numa transação própria.
    await withTenant(db, accountId, (tx) =>
      tx.update(bankConnections).set({ lastError: String(e).slice(0, 500) }).where(eq(bankConnections.id, connectionId)),
    );
    throw e;
  }
}

async function syncInTx(db: Db, agg: BankAggregator, accountId: string, connectionId: string): Promise<ImportResult[]> {
  return withTenant(db, accountId, async (tx) => {
    const [conn] = await tx.select().from(bankConnections).where(and(eq(bankConnections.id, connectionId), eq(bankConnections.accountId, accountId)));
    if (!conn || conn.status !== 'linked') return [];
    if (conn.consentExpiresAt && conn.consentExpiresAt < new Date()) {
      await tx.update(bankConnections).set({ status: 'expired' }).where(eq(bankConnections.id, conn.id));
      return [];
    }
    const accounts = await tx.select().from(bankAccounts).where(eq(bankAccounts.connectionId, conn.id));
    const from = conn.lastSyncedAt
      ? new Date(conn.lastSyncedAt.getTime() - 3 * 86_400_000).toISOString().slice(0, 10)
      : new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
    const results: ImportResult[] = [];
    for (const a of accounts) {
      if (!a.externalId) continue;
      const rows = await agg.getTransactions(a.externalId, { dateFrom: from });
      results.push(await importTransactions(tx, { accountId }, a.id, rows, { source: 'open_banking' }));
    }
    await tx.update(bankConnections).set({ lastSyncedAt: new Date(), lastError: null }).where(eq(bankConnections.id, conn.id));
    return results;
  });
}
