import type { Db } from '@somar/db';
import type { ClaimedJob } from '@somar/core';

export type JobHandler = (job: ClaimedJob, deps: { db: Db }) => Promise<void>;

/** Registo de tipos de trabalho. Cada fase acrescenta os seus (OCR, sincronização bancária, PDF, lembretes...). */
export const handlers: Record<string, JobHandler> = {
  'system.ping': async () => {},
};
