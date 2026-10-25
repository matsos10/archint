import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDb } from './client';

export const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

export async function runMigrations(url: string, folder = migrationsFolder): Promise<void> {
  const { db, close } = createDb(url, { max: 1, applicationName: 'somar-migrate' });
  try {
    await migrate(db, { migrationsFolder: folder });
  } finally {
    await close();
  }
}
