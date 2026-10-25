/** CLI: `tsx src/cli.ts migrate|seed|bootstrap`. */
import { createDb } from './client';
import { runMigrations } from './migrate';
import { runSeeders } from './seed';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '';
const cmd = process.argv[2] ?? 'bootstrap';

async function main() {
  if (cmd === 'migrate' || cmd === 'bootstrap') {
    await runMigrations(url, process.env.MIGRATIONS_DIR || undefined);
    console.log('[db] migrations aplicadas');
  }
  if (cmd === 'seed' || cmd === 'bootstrap') {
    const { db, close } = createDb(url, { max: 1, applicationName: 'somar-seed' });
    try {
      await runSeeders(db);
      console.log('[db] seeds aplicados');
    } finally {
      await close();
    }
  }
}

main().catch((e) => {
  console.error('[db] erro', e);
  process.exit(1);
});
