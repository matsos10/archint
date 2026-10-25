/** CLI: `tsx src/cli.ts migrate|seed|bootstrap`. */
import { sql } from 'drizzle-orm';
import { createDb } from './client';
import { runMigrations } from './migrate';
import { runSeeders } from './seed';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || '';
const cmd = process.argv[2] ?? 'bootstrap';

async function main() {
  if (cmd === 'make-admin') {
    const email = process.argv[3];
    if (!email) throw new Error('Uso: cli.ts make-admin <email>');
    const { db, close } = createDb(url, { max: 1 });
    try {
      const r = await db.execute(sql`update users set is_platform_admin = true where lower(email) = lower(${email}) returning id`);
      console.log(r.rows.length ? `[db] ${email} é agora administrador` : `[db] utilizador ${email} não encontrado`);
    } finally {
      await close();
    }
    return;
  }
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
