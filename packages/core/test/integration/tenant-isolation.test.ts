import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  accounts,
  auditLogs,
  bankAccounts,
  categories,
  clients,
  transactions,
  withTenant,
  type DbHandle,
} from '@somar/db';
import { switchActiveAccount, validateSession, listUserAccounts } from '../../src';
import { expectDbError, freshDb, makeUserWithAccount } from './helpers';

let h: DbHandle;
beforeEach(async () => {
  h?.close();
  h = await freshDb();
});
afterAll(async () => h?.close());

async function seedClientAndTx(accountId: string, label: string) {
  return withTenant(h.db, accountId, async (tx) => {
    const [client] = await tx.insert(clients).values({ accountId, name: `Cliente ${label}` }).returning();
    const [bank] = await tx.insert(bankAccounts).values({ accountId, source: 'manual', name: `Banco ${label}` }).returning();
    const [t] = await tx
      .insert(transactions)
      .values({
        accountId,
        bankAccountId: bank!.id,
        bookingDate: '2025-01-10',
        amountCents: 10000,
        description: `Pagamento ${label}`,
        fingerprint: `fp-${label}`,
      })
      .returning();
    return { client: client!, bank: bank!, tx: t! };
  });
}

describe('isolamento multi-tenant (RLS + filtros de aplicação)', () => {
  it('um utilizador nunca vê dados de outra conta, mesmo numa query sem filtro', async () => {
    const a = await makeUserWithAccount(h, 'Ana');
    const b = await makeUserWithAccount(h, 'Bruno');
    await seedClientAndTx(a.accountId, 'A');
    await seedClientAndTx(b.accountId, 'B');

    const seenByA = await withTenant(h.db, a.accountId, (tx) => tx.select().from(clients));
    expect(seenByA.map((c) => c.name)).toEqual(['Cliente A']);

    const txByB = await withTenant(h.db, b.accountId, (tx) => tx.select().from(transactions));
    expect(txByB.map((t) => t.description)).toEqual(['Pagamento B']);

    const accountsSeenByA = await withTenant(h.db, a.accountId, (tx) => tx.select().from(accounts));
    expect(accountsSeenByA.map((x) => x.id)).toEqual([a.accountId]);
  });

  it('não permite ler por id, atualizar ou apagar linhas de outra conta', async () => {
    const a = await makeUserWithAccount(h, 'Ana');
    const b = await makeUserWithAccount(h, 'Bruno');
    const seededB = await seedClientAndTx(b.accountId, 'B');

    await withTenant(h.db, a.accountId, async (tx) => {
      expect(await tx.select().from(clients).where(eq(clients.id, seededB.client.id))).toHaveLength(0);
      const upd = await tx.update(clients).set({ name: 'pirata' }).where(eq(clients.id, seededB.client.id)).returning();
      expect(upd).toHaveLength(0);
      const del = await tx.delete(transactions).where(eq(transactions.id, seededB.tx.id)).returning();
      expect(del).toHaveLength(0);
      const accUpd = await tx.update(accounts).set({ name: 'pirata' }).where(eq(accounts.id, b.accountId)).returning();
      expect(accUpd).toHaveLength(0);
    });

    const still = await withTenant(h.db, b.accountId, (tx) => tx.select().from(clients));
    expect(still[0]!.name).toBe('Cliente B');
  });

  it('rejeita inserir dados com o account_id de outra conta', async () => {
    const a = await makeUserWithAccount(h, 'Ana');
    const b = await makeUserWithAccount(h, 'Bruno');
    await expectDbError(
      withTenant(h.db, a.accountId, (tx) => tx.insert(clients).values({ accountId: b.accountId, name: 'intruso' })),
      /row-level security/,
    );
  });

  it('sem conta definida, o papel da app não vê nada', async () => {
    const a = await makeUserWithAccount(h, 'Ana');
    await seedClientAndTx(a.accountId, 'A');
    const rows = await h.db.transaction(async (tx) => {
      await tx.execute(sql`set local role somar_app`);
      return tx.select().from(clients);
    });
    expect(rows).toHaveLength(0);
  });

  it('o papel da app não lê hashes de palavra-passe nem altera a auditoria', async () => {
    const a = await makeUserWithAccount(h, 'Ana');
    await expectDbError(
      withTenant(h.db, a.accountId, (tx) => tx.execute(sql`select password_hash from users`)),
      /permission denied/,
    );
    await expectDbError(
      withTenant(h.db, a.accountId, (tx) => tx.update(auditLogs).set({ action: 'x' })),
      /permission denied/,
    );
    await expectDbError(withTenant(h.db, a.accountId, (tx) => tx.delete(auditLogs)), /permission denied/);
  });

  it('categorias de sistema são partilhadas (só leitura); as próprias são privadas', async () => {
    const a = await makeUserWithAccount(h, 'Ana');
    const b = await makeUserWithAccount(h, 'Bruno');
    await h.db.insert(categories).values({ accountId: null, code: 'sys', name: 'Sistema', kind: 'expense', isSystem: true });
    await withTenant(h.db, a.accountId, (tx) =>
      tx.insert(categories).values({ accountId: a.accountId, code: 'own', name: 'Da Ana', kind: 'expense' }),
    );
    const seenByB = await withTenant(h.db, b.accountId, (tx) => tx.select().from(categories));
    expect(seenByB.map((c) => c.code)).toContain('sys');
    expect(seenByB.map((c) => c.code)).not.toContain('own');
    expect(seenByB.every((c) => c.accountId === null)).toBe(true);
    const upd = await withTenant(h.db, b.accountId, (tx) =>
      tx.update(categories).set({ name: 'alterada' }).where(eq(categories.code, 'sys')).returning(),
    );
    expect(upd).toHaveLength(0);
  });

  it('a sessão só pode ativar contas de que o utilizador é membro', async () => {
    const a = await makeUserWithAccount(h, 'Ana');
    const b = await makeUserWithAccount(h, 'Bruno');
    const session = await validateSession(h.db, a.token);
    expect(session?.activeAccountId).toBe(a.accountId);
    await expect(switchActiveAccount(h.db, session!.sessionId, a.userId, b.accountId)).rejects.toThrow(/Sem acesso/);
    expect((await listUserAccounts(h.db, a.userId)).map((x) => x.id)).toEqual([a.accountId]);
  });

  it('todas as tabelas com account_id têm RLS ativa (proteção contra esquecimentos em migrations futuras)', async () => {
    const res = await h.db.execute<{ table_name: string; rls: boolean }>(sql`
      select c.table_name, cl.relrowsecurity as rls
      from information_schema.columns c
      join pg_class cl on cl.relname = c.table_name and cl.relnamespace = 'public'::regnamespace
      where c.table_schema = 'public' and c.column_name = 'account_id'`);
    // Tabelas de plataforma, acedidas só pelo papel de plataforma (nunca pelo papel da app).
    const platformOnly = new Set(['data_requests']);
    const missing = res.rows.filter((r) => !r.rls && !platformOnly.has(r.table_name)).map((r) => r.table_name);
    expect(missing).toEqual([]);
  });
});
