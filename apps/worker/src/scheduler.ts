import { sql } from 'drizzle-orm';
import type { Db } from '@somar/db';
import { enqueueJob } from '@somar/core';

/**
 * Tarefas periódicas (corre no worker): agenda trabalhos com chaves de deduplicação por janela
 * temporal, pelo que vários workers podem correr o agendador sem duplicar trabalho.
 */
export async function runSchedules(db: Db, now = new Date()) {
  const window6h = `${now.toISOString().slice(0, 10)}T${Math.floor(now.getUTCHours() / 6)}`;
  const day = now.toISOString().slice(0, 10);

  // Sincronização bancária a cada 6 horas para as ligações ativas (papel de plataforma: lista todas as contas).
  const conns = await db.execute<{ id: string; account_id: string }>(
    sql`select id, account_id from bank_connections where status = 'linked'`,
  );
  for (const c of conns.rows) {
    await enqueueJob(db, 'bank.sync', { connectionId: c.id }, { accountId: c.account_id, dedupeKey: `bank.sync:${c.id}:${window6h}` });
  }

  // Alertas diários por conta ativa
  const accs = await db.execute<{ id: string }>(sql`select id from accounts where deleted_at is null`);
  for (const a of accs.rows) {
    await enqueueJob(db, 'insights.refresh', {}, { accountId: a.id, dedupeKey: `insights:${a.id}:${day}` });
    await enqueueJob(db, 'obligations.notify', {}, { accountId: a.id, dedupeKey: `obligations:${a.id}:${day}` });
    // Lembretes às 9h (UTC ≈ hora de Lisboa no inverno): só a partir dessa hora, uma vez por dia
    if (now.getUTCHours() >= 9) {
      await enqueueJob(db, 'invoices.reminders', {}, { accountId: a.id, dedupeKey: `reminders:${a.id}:${day}` });
    }
  }
  return { bankSyncs: conns.rows.length, accounts: accs.rows.length };
}
