import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { transactions } from './accounting';
import { accounts, files, timestamps, users } from './core';
import { invoiceDocTypeEnum, invoiceStatusEnum, quoteStatusEnum, vatRateCodeEnum } from './enums';

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    nif: varchar('nif', { length: 20 }),
    email: varchar('email', { length: 320 }),
    addressLine: varchar('address_line', { length: 300 }),
    postalCode: varchar('postal_code', { length: 10 }),
    city: varchar('city', { length: 100 }),
    country: varchar('country', { length: 2 }).notNull().default('PT'),
    isCompany: boolean('is_company').notNull().default(true),
    /** Cliente com contabilidade organizada: obriga a retenção na fonte (art. 101.º CIRS). */
    hasOrganizedAccounting: boolean('has_organized_accounting').notNull().default(true),
    paymentTermsDays: integer('payment_terms_days').notNull().default(30),
    notes: text('notes'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('clients_account_idx').on(t.accountId)],
);

/** Série documental. Cada série é comunicada à AT e recebe um código de validação (ATCUD). */
export const documentSeries = pgTable(
  'document_series',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    docType: varchar('doc_type', { length: 4 }).notNull(),
    code: varchar('code', { length: 20 }).notNull(),
    year: integer('year').notNull(),
    nextNumber: integer('next_number').notNull().default(1),
    /** Código de validação atribuído pela AT à série (componente do ATCUD). */
    atValidationCode: varchar('at_validation_code', { length: 20 }),
    providerSeriesId: varchar('provider_series_id', { length: 100 }),
    active: boolean('active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('series_unique').on(t.accountId, t.docType, t.code)],
);

const documentColumns = {
  clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
  /** Cópia dos dados do cliente no momento da emissão (imutável após emissão). */
  clientSnapshot: jsonb('client_snapshot').$type<Record<string, unknown>>(),
  issueDate: date('issue_date', { mode: 'string' }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
  netCents: bigint('net_cents', { mode: 'number' }).notNull().default(0),
  vatCents: bigint('vat_cents', { mode: 'number' }).notNull().default(0),
  withholdingCents: bigint('withholding_cents', { mode: 'number' }).notNull().default(0),
  totalCents: bigint('total_cents', { mode: 'number' }).notNull().default(0),
  notes: text('notes'),
  pdfFileId: uuid('pdf_file_id').references(() => files.id, { onDelete: 'set null' }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
};

export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    number: varchar('number', { length: 40 }),
    status: quoteStatusEnum('status').notNull().default('draft'),
    validUntil: date('valid_until', { mode: 'string' }),
    invoiceId: uuid('invoice_id'),
    ...documentColumns,
    ...timestamps,
  },
  (t) => [index('quotes_account_idx').on(t.accountId)],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    docType: invoiceDocTypeEnum('doc_type').notNull().default('FT'),
    seriesId: uuid('series_id').references(() => documentSeries.id, { onDelete: 'restrict' }),
    /** Número completo, ex.: "FT 2025A/12". */
    number: varchar('number', { length: 40 }),
    sequence: integer('sequence'),
    status: invoiceStatusEnum('status').notNull().default('draft'),
    dueDate: date('due_date', { mode: 'string' }),
    atcud: varchar('atcud', { length: 100 }),
    qrPayload: text('qr_payload'),
    /** Hash/assinatura devolvidos pelo software certificado. */
    documentHash: varchar('document_hash', { length: 200 }),
    provider: varchar('provider', { length: 40 }),
    providerRef: varchar('provider_ref', { length: 100 }),
    relatedInvoiceId: uuid('related_invoice_id'),
    paidCents: bigint('paid_cents', { mode: 'number' }).notNull().default(0),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    remindersEnabled: boolean('reminders_enabled').notNull().default(true),
    lastReminderAt: timestamp('last_reminder_at', { withTimezone: true }),
    ...documentColumns,
    ...timestamps,
  },
  (t) => [
    index('invoices_account_date_idx').on(t.accountId, t.issueDate),
    uniqueIndex('invoices_series_seq_unique').on(t.seriesId, t.sequence),
  ],
);

export const documentLines = pgTable(
  'document_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }),
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    description: varchar('description', { length: 500 }).notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3, mode: 'number' }).notNull().default(1),
    unit: varchar('unit', { length: 20 }).notNull().default('un'),
    unitPriceCents: bigint('unit_price_cents', { mode: 'number' }).notNull(),
    discountPct: numeric('discount_pct', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
    vatRateCode: vatRateCodeEnum('vat_rate_code').notNull(),
    vatRatePct: numeric('vat_rate_pct', { precision: 5, scale: 2, mode: 'number' }).notNull(),
    /** Código de motivo de isenção (M01–M99, tabela da AT), obrigatório quando a taxa é 0. */
    vatExemptionCode: varchar('vat_exemption_code', { length: 3 }),
    netCents: bigint('net_cents', { mode: 'number' }).notNull(),
    vatCents: bigint('vat_cents', { mode: 'number' }).notNull(),
  },
  (t) => [index('lines_invoice_idx').on(t.invoiceId), index('lines_quote_idx').on(t.quoteId)],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    paidOn: date('paid_on', { mode: 'string' }).notNull(),
    method: varchar('method', { length: 30 }).notNull().default('transferencia'),
    transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('payments_invoice_idx').on(t.invoiceId)],
);

export const invoiceReminders = pgTable('invoice_reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id')
    .notNull()
    .references(() => invoices.id, { onDelete: 'cascade' }),
  stage: integer('stage').notNull(),
  channel: varchar('channel', { length: 20 }).notNull().default('email'),
  subject: varchar('subject', { length: 200 }).notNull(),
  body: text('body').notNull(),
  aiGenerated: boolean('ai_generated').notNull().default(false),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});
