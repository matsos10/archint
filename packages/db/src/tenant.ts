import { sql } from 'drizzle-orm';
import type { Db, Tx } from './client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Transação limitada a uma conta: todas as queries passam pela RLS do papel somar_app. */
declare const tenantBrand: unique symbol;
export type TenantTx = Tx & { readonly [tenantBrand]: true };

export interface TenantContext {
  accountId: string;
  userId?: string | null;
}

/**
 * Executa `fn` numa transação isolada à conta `accountId`.
 *
 * - Define `app.account_id` (local à transação) e muda para o papel `somar_app`, sujeito a RLS.
 * - Mesmo que uma query se esqueça do filtro `account_id`, o Postgres só devolve linhas da conta.
 * - O código de aplicação deve, ainda assim, filtrar sempre por `account_id` (dupla proteção).
 */
export async function withTenant<T>(db: Db, ctx: TenantContext | string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  const accountId = typeof ctx === 'string' ? ctx : ctx.accountId;
  if (!UUID_RE.test(accountId)) throw new Error('account_id inválido');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.account_id', ${accountId}, true)`);
    await tx.execute(sql`set local role somar_app`);
    return fn(tx as TenantTx);
  });
}
