import { sql } from 'drizzle-orm';
import { jobs, type Db, type Executor } from '@somar/db';

export interface EnqueueOptions {
  accountId?: string | null;
  runAt?: Date;
  maxAttempts?: number;
  /** Evita trabalhos duplicados (ex.: "reminder:<fatura>:<estágio>"). */
  dedupeKey?: string;
}

export async function enqueueJob(exec: Executor, type: string, payload: Record<string, unknown> = {}, opts: EnqueueOptions = {}) {
  const rows = await exec
    .insert(jobs)
    .values({
      type,
      payload,
      accountId: opts.accountId ?? null,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 5,
      dedupeKey: opts.dedupeKey,
    })
    .onConflictDoNothing({ target: jobs.dedupeKey })
    .returning({ id: jobs.id });
  return rows[0]?.id ?? null;
}

export type ClaimedJob = typeof jobs.$inferSelect;

/** Reclama o próximo trabalho pronto (SKIP LOCKED permite vários workers em paralelo). */
export async function claimNextJob(db: Db, workerId: string, types?: string[]): Promise<ClaimedJob | null> {
  const typeFilter = types?.length ? sql`and type in (${sql.join(types.map((t) => sql`${t}`), sql`, `)})` : sql``;
  const res = await db.execute(sql`
    update jobs set status = 'running', locked_at = now(), locked_by = ${workerId}, attempts = attempts + 1, updated_at = now()
    where id = (
      select id from jobs where status = 'queued' and run_at <= now() ${typeFilter}
      order by run_at limit 1 for update skip locked
    )
    returning *`);
  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as string,
    accountId: (row.account_id as string) ?? null,
    type: row.type as string,
    payload: row.payload as Record<string, unknown>,
    status: row.status as ClaimedJob['status'],
    runAt: new Date(row.run_at as string),
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    lastError: (row.last_error as string) ?? null,
    lockedAt: row.locked_at ? new Date(row.locked_at as string) : null,
    lockedBy: (row.locked_by as string) ?? null,
    dedupeKey: (row.dedupe_key as string) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function completeJob(db: Db, id: string) {
  await db.execute(sql`update jobs set status = 'done', locked_at = null, updated_at = now() where id = ${id}`);
}

/** Falha com nova tentativa em backoff exponencial (30 s, 2 min, 8 min, ...) até max_attempts. */
export async function failJob(db: Db, job: ClaimedJob, error: unknown) {
  const msg = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  const dead = job.attempts >= job.maxAttempts;
  const delaySec = 30 * 4 ** (job.attempts - 1);
  await db.execute(sql`
    update jobs set status = ${dead ? 'dead' : 'queued'}, last_error = ${msg}, locked_at = null,
      run_at = now() + make_interval(secs => ${delaySec}), updated_at = now()
    where id = ${job.id}`);
}

/** Devolve à fila trabalhos presos (worker morreu a meio). */
export async function releaseStaleJobs(db: Db, olderThanMinutes = 15) {
  await db.execute(sql`
    update jobs set status = 'queued', locked_at = null, updated_at = now()
    where status = 'running' and locked_at < now() - make_interval(mins => ${olderThanMinutes})`);
}
