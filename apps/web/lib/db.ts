import 'server-only';
import { createDb, type DbHandle } from '@somar/db';

const globalForDb = globalThis as unknown as { __somarDb?: DbHandle };

/** Ligação partilhada (pooler do Neon). Em dev, sobrevive ao hot reload. */
export function getDb() {
  globalForDb.__somarDb ??= createDb(process.env.DATABASE_URL ?? '', { applicationName: 'somar-web' });
  return globalForDb.__somarDb.db;
}
