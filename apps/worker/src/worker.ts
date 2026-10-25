import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import os from 'node:os';
import type { Db } from '@somar/db';
import { claimNextJob, completeJob, failJob, releaseStaleJobs } from '@somar/core';
import { handlers as defaultHandlers, type JobHandler } from './handlers';

export interface WorkerOptions {
  db: Db;
  handlers?: Record<string, JobHandler>;
  pollIntervalMs?: number;
  heartbeatFile?: string;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export function createWorker(opts: WorkerOptions) {
  const id = `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  const handlers = opts.handlers ?? defaultHandlers;
  const log = opts.log ?? ((m, e) => console.log(JSON.stringify({ t: new Date().toISOString(), worker: id, msg: m, ...e })));
  let running = false;
  let lastMaintenance = 0;

  /** Processa um trabalho; devolve false se a fila estiver vazia. */
  async function tick(): Promise<boolean> {
    if (Date.now() - lastMaintenance > 60_000) {
      lastMaintenance = Date.now();
      await releaseStaleJobs(opts.db);
    }
    const job = await claimNextJob(opts.db, id, Object.keys(handlers));
    if (!job) return false;
    const handler = handlers[job.type]!;
    const started = Date.now();
    try {
      await handler(job, { db: opts.db });
      await completeJob(opts.db, job.id);
      log('job.done', { type: job.type, jobId: job.id, ms: Date.now() - started });
    } catch (err) {
      await failJob(opts.db, job, err);
      log('job.failed', { type: job.type, jobId: job.id, attempt: job.attempts, error: String(err) });
    }
    return true;
  }

  async function heartbeat() {
    if (opts.heartbeatFile) await writeFile(opts.heartbeatFile, String(Date.now())).catch(() => {});
  }

  async function run() {
    running = true;
    log('worker.started');
    while (running) {
      await heartbeat();
      let worked = false;
      try {
        worked = await tick();
      } catch (err) {
        log('worker.error', { error: String(err) });
      }
      if (!worked) await new Promise((r) => setTimeout(r, opts.pollIntervalMs ?? 2000));
    }
    log('worker.stopped');
  }

  return { id, tick, run, stop: () => (running = false) };
}
