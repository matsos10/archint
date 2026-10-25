import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { accounts, files, timestamps, users } from './core';
import {
  bankConnectionStatusEnum,
  bankSourceEnum,
  categoryKindEnum,
  categorySourceEnum,
  insightStatusEnum,
  insightTypeEnum,
  irsIncomeTypeEnum,
  receiptStatusEnum,
  transactionStatusEnum,
  vatRateCodeEnum,
} from './enums';

/**
 * Ligação a um agregador de open banking (PSD2, só leitura).
 * Nunca guardamos credenciais bancárias: apenas o identificador do consentimento no agregador.
 */
export const bankConnections = pgTable('bank_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 40 }).notNull(),
  institutionId: varchar('institution_id', { length: 100 }).notNull(),
  institutionName: varchar('institution_name', { length: 200 }),
  /** Referência do consentimento/requisição no agregador, encriptada. */
  externalRefEnc: text('external_ref_enc'),
  status: bankConnectionStatusEnum('status').notNull().default('pending'),
  consentExpiresAt: timestamp('consent_expires_at', { withTimezone: true }),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  lastError: text('last_error'),
  ...timestamps,
});

export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(() => bankConnections.id, { onDelete: 'set null' }),
    source: bankSourceEnum('source').notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    ibanEnc: text('iban_enc'),
    ibanLast4: varchar('iban_last4', { length: 4 }),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    externalId: varchar('external_id', { length: 200 }),
    balanceCents: bigint('balance_cents', { mode: 'number' }),
    balanceAt: timestamp('balance_at', { withTimezone: true }),
    isBusiness: boolean('is_business').notNull().default(true),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('bank_accounts_account_idx').on(t.accountId)],
);

/**
 * Categoria contabilística com tratamento fiscal.
 * account_id NULL = categoria de sistema (visível a todas as contas, só leitura).
 */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 60 }).notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    kind: categoryKindEnum('kind').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, { onDelete: 'set null' }),
    /** Dedutível para efeitos de IRS/IRC (contabilidade organizada / justificação dos 15%). */
    deductible: boolean('deductible').notNull().default(false),
    deductiblePct: numeric('deductible_pct', { precision: 5, scale: 2, mode: 'number' }).notNull().default(0),
    defaultVatRate: vatRateCodeEnum('default_vat_rate'),
    /** Natureza da despesa para o direito à dedução (chave de params.vat.deductibility, art. 21.º CIVA). */
    vatDeductionKey: varchar('vat_deduction_key', { length: 40 }).notNull().default('geral'),
    /** Sobreposição manual da % de IVA dedutível (null = usar os parâmetros do ano). */
    vatDeductiblePct: numeric('vat_deductible_pct', { precision: 5, scale: 2, mode: 'number' }),
    /** Campo da declaração periódica para o IVA dedutível: imobilizado, existências ou outros. */
    vatBucket: varchar('vat_bucket', { length: 15 }).notNull().default('outros'),
    /** Para receitas: tipo de rendimento da categoria B (coeficiente do regime simplificado). */
    irsIncomeType: irsIncomeTypeEnum('irs_income_type'),
    /** Conta SNC sugerida (SAF-T contabilidade). */
    sncAccount: varchar('snc_account', { length: 12 }),
    requiresReceipt: boolean('requires_receipt').notNull().default(true),
    legalNote: text('legal_note'),
    isSystem: boolean('is_system').notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex('categories_account_code_unique').on(t.accountId, t.code)],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    bankAccountId: uuid('bank_account_id')
      .notNull()
      .references(() => bankAccounts.id, { onDelete: 'cascade' }),
    bookingDate: date('booking_date', { mode: 'string' }).notNull(),
    valueDate: date('value_date', { mode: 'string' }),
    /** Montante em cêntimos; positivo = entrada, negativo = saída. */
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('EUR'),
    description: text('description').notNull(),
    counterparty: varchar('counterparty', { length: 200 }),
    externalId: varchar('external_id', { length: 200 }),
    /** Impressão digital para deteção de duplicados (data+montante+descrição normalizada). */
    fingerprint: varchar('fingerprint', { length: 64 }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    categorySource: categorySourceEnum('category_source'),
    categoryConfidence: real('category_confidence'),
    status: transactionStatusEnum('status').notNull().default('to_review'),
    vatRateCode: vatRateCodeEnum('vat_rate_code'),
    /** IVA contido no montante (cêntimos, sempre positivo). */
    vatCents: bigint('vat_cents', { mode: 'number' }),
    /** % profissional (despesas mistas). */
    businessPct: numeric('business_pct', { precision: 5, scale: 2, mode: 'number' }).notNull().default(100),
    invoiceId: uuid('invoice_id'),
    duplicateOfId: uuid('duplicate_of_id').references((): AnyPgColumn => transactions.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    /** Registo de IA da última sugestão de categoria (para registar a decisão do utilizador). */
    aiLogId: uuid('ai_log_id'),
    ...timestamps,
  },
  (t) => [
    index('transactions_account_date_idx').on(t.accountId, t.bookingDate),
    index('transactions_fingerprint_idx').on(t.accountId, t.fingerprint),
    uniqueIndex('transactions_external_unique').on(t.bankAccountId, t.externalId),
  ],
);

/** Regras de categorização (criadas pelo sistema ou aprendidas das correções do utilizador). */
export const categorizationRules = pgTable(
  'categorization_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    matchField: varchar('match_field', { length: 20 }).notNull().default('description'),
    matchType: varchar('match_type', { length: 20 }).notNull().default('contains'),
    pattern: varchar('pattern', { length: 200 }).notNull(),
    direction: varchar('direction', { length: 10 }).notNull().default('any'),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    vatRateCode: vatRateCodeEnum('vat_rate_code'),
    priority: integer('priority').notNull().default(100),
    createdFrom: varchar('created_from', { length: 20 }).notNull().default('user'),
    hits: integer('hits').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('rules_account_idx').on(t.accountId)],
);

/** Justificativo (fatura/recibo de despesa) com dados extraídos. */
export const receipts = pgTable(
  'receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id').references(() => transactions.id, { onDelete: 'set null' }),
    status: receiptStatusEnum('status').notNull().default('uploaded'),
    /** Dados extraídos (OCR/IA) antes da confirmação; nunca usados diretamente em declarações. */
    extracted: jsonb('extracted').$type<Record<string, unknown>>(),
    extractionConfidence: real('extraction_confidence'),
    supplierNif: varchar('supplier_nif', { length: 9 }),
    supplierName: varchar('supplier_name', { length: 200 }),
    documentNumber: varchar('document_number', { length: 60 }),
    atcud: varchar('atcud', { length: 100 }),
    documentDate: date('document_date', { mode: 'string' }),
    totalCents: bigint('total_cents', { mode: 'number' }),
    vatCents: bigint('vat_cents', { mode: 'number' }),
    confirmedBy: uuid('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    aiLogId: uuid('ai_log_id'),
    ...timestamps,
  },
  (t) => [index('receipts_account_idx').on(t.accountId), index('receipts_tx_idx').on(t.transactionId)],
);

export const insights = pgTable(
  'insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    type: insightTypeEnum('type').notNull(),
    code: varchar('code', { length: 60 }).notNull(),
    severity: varchar('severity', { length: 10 }).notNull().default('info'),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body'),
    entityType: varchar('entity_type', { length: 40 }),
    entityId: uuid('entity_id'),
    data: jsonb('data').$type<Record<string, unknown>>(),
    source: varchar('source', { length: 10 }).notNull().default('rule'),
    status: insightStatusEnum('status').notNull().default('open'),
    dedupeKey: varchar('dedupe_key', { length: 200 }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('insights_dedupe_unique').on(t.accountId, t.dedupeKey)],
);
