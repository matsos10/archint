import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema>;
/** Transação Drizzle (tipo do argumento passado a db.transaction). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Executor genérico: base de dados ou transação. */
export type Executor = Db | Tx;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export interface CreateDbOptions {
  /** Número máximo de ligações no pool local (o Neon faz pooling adicional do lado do servidor). */
  max?: number;
  applicationName?: string;
}

export function createDb(url: string, options: CreateDbOptions = {}): DbHandle {
  if (!url) throw new Error('DATABASE_URL não definido');
  const pool = new pg.Pool({
    connectionString: url,
    max: options.max ?? 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: options.applicationName ?? 'somar',
  });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
