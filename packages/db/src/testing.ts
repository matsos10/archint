import { sql } from 'drizzle-orm';
import { createDb, type DbHandle } from './client';
import { runMigrations } from './migrate';

/**
 * Utilitários de teste: base de dados Postgres real (TEST_DATABASE_URL), com um papel
 * de ligação sem superutilizador, tal como no Neon, para que a RLS seja efetiva.
 */
export function testDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL || 'postgres://dev:dev@localhost:5432/contas_test';
}

/** Recria o schema e aplica as migrations (chamado uma vez, no globalSetup do Vitest). */
export async function resetAndMigrate(url = testDatabaseUrl()): Promise<void> {
  const h = createDb(url, { max: 1 });
  try {
    await h.db.execute(sql`drop schema if exists public cascade`);
    await h.db.execute(sql`drop schema if exists drizzle cascade`);
    await h.db.execute(sql`create schema public`);
  } finally {
    await h.close();
  }
  await runMigrations(url);
}

export function connectTestDb(): DbHandle {
  return createDb(testDatabaseUrl(), { max: 5 });
}

/** Limpa todos os dados (mantendo o schema) entre testes. */
export async function truncateAll(handle: DbHandle): Promise<void> {
  const res = await handle.db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = res.rows.map((r) => `"${r.tablename}"`).join(', ');
  if (names) await handle.db.execute(sql.raw(`truncate ${names} restart identity cascade`));
}
