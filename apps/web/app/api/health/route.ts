import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Verificação de saúde usada pelo Docker e pelo proxy: confirma a ligação ao Neon. */
export async function GET() {
  const started = Date.now();
  try {
    const res = await getDb().execute<{ ok: number; ssl: boolean | null }>(
      sql`select 1 as ok, (select ssl from pg_stat_ssl where pid = pg_backend_pid()) as ssl`,
    );
    return Response.json({ status: 'ok', db: 'ok', ssl: res.rows[0]?.ssl ?? null, latencyMs: Date.now() - started });
  } catch {
    return Response.json({ status: 'error', db: 'unreachable' }, { status: 503 });
  }
}
