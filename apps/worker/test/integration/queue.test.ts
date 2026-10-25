import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { jobs, type DbHandle } from '@somar/db';
import { connectTestDb, truncateAll } from '@somar/db/testing';
import { enqueueJob } from '@somar/core';
import { createWorker } from '../../src/worker';

let h: DbHandle;
beforeAll(async () => {
  h = connectTestDb();
  await truncateAll(h);
});
afterAll(async () => h.close());

describe('fila de trabalhos', () => {
  it('processa, faz retry com backoff e não duplica trabalhos com a mesma chave', async () => {
    let calls = 0;
    const worker = createWorker({
      db: h.db,
      schedules: false,
      log: () => {},
      handlers: {
        ok: async () => {},
        boom: async () => {
          calls++;
          throw new Error('falhou');
        },
      },
    });
    const okId = await enqueueJob(h.db, 'ok', {}, { dedupeKey: 'k1' });
    expect(await enqueueJob(h.db, 'ok', {}, { dedupeKey: 'k1' })).toBeNull();
    const boomId = await enqueueJob(h.db, 'boom', {}, { maxAttempts: 2 });

    expect(await worker.tick()).toBe(true);
    expect(await worker.tick()).toBe(true);
    expect(await worker.tick()).toBe(false); // boom agendado para mais tarde

    const [ok] = await h.db.select().from(jobs).where(eq(jobs.id, okId!));
    expect(ok!.status).toBe('done');
    const [boom] = await h.db.select().from(jobs).where(eq(jobs.id, boomId!));
    expect(boom!.status).toBe('queued');
    expect(boom!.lastError).toBe('falhou');
    expect(boom!.runAt.getTime()).toBeGreaterThan(Date.now());

    await h.db.update(jobs).set({ runAt: new Date(0) }).where(eq(jobs.id, boomId!));
    await worker.tick();
    const [dead] = await h.db.select().from(jobs).where(eq(jobs.id, boomId!));
    expect(dead!.status).toBe('dead');
    expect(calls).toBe(2);
  });
});

describe('agendador', () => {
  it('agenda sincronizações e alertas sem duplicar na mesma janela', async () => {
    const { runSchedules } = await import('../../src/scheduler');
    const now = new Date('2026-03-01T07:00:00Z');
    const a = await runSchedules(h.db, now);
    const b = await runSchedules(h.db, now);
    expect(a).toEqual(b);
    const rows = await h.db.select().from(jobs).where(eq(jobs.type, 'insights.refresh'));
    expect(rows.length).toBe(a.accounts);
  });
});
