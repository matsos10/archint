import { sql } from 'drizzle-orm';
import type { Db } from '@somar/db';
import { AppError } from './errors';

/**
 * Limitador de pedidos por janela fixa, guardado em Postgres (funciona com várias instâncias).
 * Devolve o número de pedidos na janela atual.
 */
export async function hit(db: Db, key: string, windowSeconds: number): Promise<number> {
  const res = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
    returning count`);
  return Number(res.rows[0]?.count ?? 0);
}

export async function enforceRateLimit(db: Db, key: string, limit: number, windowSeconds: number): Promise<void> {
  const count = await hit(db, key, windowSeconds);
  if (count > limit) {
    throw new AppError('rate_limited', 'Demasiadas tentativas. Tenta novamente daqui a alguns minutos.', 429);
  }
}

export async function resetRateLimit(db: Db, key: string): Promise<void> {
  await db.execute(sql`delete from rate_limits where key = ${key}`);
}
