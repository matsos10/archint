import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { accounts, files, timestamps, users } from './core';
import {
  declarationStatusEnum,
  obligationStatusEnum,
  obligationTypeEnum,
  paramSetStatusEnum,
} from './enums';

/**
 * Parâmetros fiscais versionados por ano (escalões, coeficientes, taxas, limites, prazos).
 * Tabela global e editável; o motor fiscal recebe-os como entrada e valida-os com Zod.
 */
export const taxParameterSets = pgTable(
  'tax_parameter_sets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    year: integer('year').notNull(),
    version: integer('version').notNull(),
    status: paramSetStatusEnum('status').notNull().default('draft'),
    params: jsonb('params').$type<Record<string, unknown>>().notNull(),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('tax_params_year_version_unique').on(t.year, t.version)],
);

export const taxObligations = pgTable(
  'tax_obligations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    type: obligationTypeEnum('type').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    periodLabel: varchar('period_label', { length: 40 }).notNull(),
    /** Início do prazo (algumas obrigações têm janela, ex.: IRS de 1/4 a 30/6). */
    windowStart: date('window_start', { mode: 'string' }),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    status: obligationStatusEnum('status').notNull().default('upcoming'),
    amountEstimateCents: bigint('amount_estimate_cents', { mode: 'number' }),
    declarationId: uuid('declaration_id'),
    legalRef: varchar('legal_ref', { length: 200 }),
    lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('obligations_account_due_idx').on(t.accountId, t.dueDate),
    uniqueIndex('obligations_unique').on(t.accountId, t.type, t.periodStart, t.periodEnd),
  ],
);

export const declarations = pgTable(
  'declarations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    obligationId: uuid('obligation_id').references(() => taxObligations.id, { onDelete: 'set null' }),
    type: obligationTypeEnum('type').notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    status: declarationStatusEnum('status').notNull().default('draft'),
    /** Dados calculados pelo motor fiscal (nunca diretamente pela IA). */
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    engineVersion: varchar('engine_version', { length: 20 }).notNull(),
    paramSetId: uuid('param_set_id').references(() => taxParameterSets.id, { onDelete: 'restrict' }),
    fileId: uuid('file_id').references(() => files.id, { onDelete: 'set null' }),
    confirmedBy: uuid('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    submissionRef: varchar('submission_ref', { length: 100 }),
    ...timestamps,
  },
  (t) => [index('declarations_account_idx').on(t.accountId, t.periodStart)],
);
