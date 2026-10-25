import { withTenant, type Db } from '@somar/db';
import { defaultAggregator, defaultMailer, defaultStorage, refreshInsights, sendDueReminders, syncBankConnection, type ClaimedJob } from '@somar/core';

export type JobHandler = (job: ClaimedJob, deps: { db: Db }) => Promise<void>;

/** Registo de tipos de trabalho. Cada fase acrescenta os seus. */
export const handlers: Record<string, JobHandler> = {
  'system.ping': async () => {},

  /** Sincroniza os movimentos de uma ligação bancária (open banking). */
  'bank.sync': async (job, { db }) => {
    const agg = defaultAggregator();
    if (!agg) throw new Error('Agregador bancário não configurado');
    if (!job.accountId) throw new Error('bank.sync sem conta');
    await syncBankConnection(db, agg, job.accountId, String(job.payload.connectionId));
  },

  /** Lembretes de cobrança das faturas vencidas (diário). */
  'invoices.reminders': async (job, { db }) => {
    if (!job.accountId) return;
    const today = new Date().toISOString().slice(0, 10);
    await withTenant(db, job.accountId, (tx) => sendDueReminders(tx, { mailer: defaultMailer(), storage: defaultStorage() }, job.accountId!, today));
  },

  /** Recalcula os alertas (duplicados, justificativos e faturas em falta). */
  'insights.refresh': async (job, { db }) => {
    if (!job.accountId) return;
    await withTenant(db, job.accountId, (tx) => refreshInsights(tx, job.accountId!));
  },
};
