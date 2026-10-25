import { withTenant, type Db } from '@somar/db';
import { defaultLlmClient } from '@somar/ai';
import { aiDetectAnomalies, aiExtractReceipt, aiReminderComposer, llmForAccount, defaultAggregator, defaultMailer, defaultStorage, loadTaxParams, notifyObligations, refreshInsights, sendDueReminders, syncBankConnection, syncObligations, type ClaimedJob } from '@somar/core';

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
    await withTenant(db, job.accountId, async (tx) => {
      const llm = await llmForAccount(tx, job.accountId!, defaultLlmClient());
      const compose = llm ? aiReminderComposer(tx, { accountId: job.accountId! }, llm) : undefined;
      await sendDueReminders(tx, { mailer: defaultMailer(), storage: defaultStorage(), compose }, job.accountId!, today);
    });
  },

  /** Atualiza o calendário fiscal e notifica os prazos (10 e 3 dias antes, no dia, em atraso). */
  'obligations.notify': async (job, { db }) => {
    if (!job.accountId) return;
    const loaded = await loadTaxParams(db);
    await syncObligations(db, job.accountId, undefined, loaded);
    const today = new Date().toISOString().slice(0, 10);
    await withTenant(db, job.accountId, (tx) => notifyObligations(tx, { mailer: defaultMailer(), loaded, appUrl: process.env.APP_URL }, job.accountId!, today));
  },

  /** Leitura de justificativos por IA (OCR). Sem IA, o justificativo fica para preenchimento manual. */
  'receipt.ocr': async (job, { db }) => {
    if (!job.accountId) return;
    const loaded = await loadTaxParams(db);
    await withTenant(db, job.accountId, async (tx) => {
      const llm = await llmForAccount(tx, job.accountId!, defaultLlmClient());
      if (!llm) return;
      await aiExtractReceipt(tx, { llm, storage: defaultStorage(), params: loaded.resolve(new Date().getUTCFullYear()) }, { accountId: job.accountId! }, String(job.payload.receiptId));
    });
  },

  /** Deteção semanal de anomalias por IA (complementa as regras). */
  'ai.anomalies': async (job, { db }) => {
    if (!job.accountId) return;
    await withTenant(db, job.accountId, async (tx) => {
      const llm = await llmForAccount(tx, job.accountId!, defaultLlmClient());
      if (llm) await aiDetectAnomalies(tx, { accountId: job.accountId! }, llm);
    });
  },

  /** Recalcula os alertas (duplicados, justificativos e faturas em falta). */
  'insights.refresh': async (job, { db }) => {
    if (!job.accountId) return;
    await withTenant(db, job.accountId, (tx) => refreshInsights(tx, job.accountId!));
  },
};
