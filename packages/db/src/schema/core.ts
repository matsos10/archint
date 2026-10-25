import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import {
  actorTypeEnum,
  dataRequestStatusEnum,
  dataRequestTypeEnum,
  fileKindEnum,
  incomeTaxRegimeEnum,
  irsIncomeTypeEnum,
  jobStatusEnum,
  legalFormEnum,
  membershipRoleEnum,
  taxRegionEnum,
  vatRegimeEnum,
} from './enums';

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Utilizadores e autenticação (tabelas globais, sem RLS por conta)
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 320 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    /** Segredo TOTP encriptado (AES-256-GCM, ver @somar/core/crypto). */
    totpSecretEnc: text('totp_secret_enc'),
    totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
    /** Último passo TOTP aceite (impede reutilização do mesmo código). */
    totpLastUsedStep: bigint('totp_last_used_step', { mode: 'number' }),
    /** Hashes SHA-256 dos códigos de recuperação ainda não usados. */
    recoveryCodeHashes: jsonb('recovery_code_hashes').$type<string[]>().notNull().default([]),
    locale: varchar('locale', { length: 10 }).notNull().default('pt-PT'),
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_unique').on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 do token de sessão; o token em claro só existe no cookie. */
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activeAccountId: uuid('active_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    /** false enquanto o segundo fator ainda não foi validado. */
    twoFactorVerified: boolean('two_factor_verified').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 400 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const rateLimits = pgTable('rate_limits', {
  key: varchar('key', { length: 200 }).primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull().default(0),
});

// ---------------------------------------------------------------------------
// Conta (tenant): empresa ou atividade
// ---------------------------------------------------------------------------

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull(),
  legalForm: legalFormEnum('legal_form').notNull(),
  nif: varchar('nif', { length: 9 }),
  vatRegime: vatRegimeEnum('vat_regime').notNull(),
  incomeTaxRegime: incomeTaxRegimeEnum('income_tax_regime').notNull(),
  taxRegion: taxRegionEnum('tax_region').notNull().default('continente'),
  activityStartDate: date('activity_start_date', { mode: 'string' }).notNull(),
  /** CAE principal (Rev. 4). */
  cae: varchar('cae', { length: 5 }),
  /** Código de atividade da tabela do art. 151.º CIRS (só para categoria B). */
  cirsActivityCode: varchar('cirs_activity_code', { length: 4 }),
  mainIncomeType: irsIncomeTypeEnum('main_income_type'),
  /** Tem rendimentos de trabalho dependente em simultâneo (relevante para SS e IRS). */
  hasEmploymentIncome: boolean('has_employment_income').notNull().default(false),
  /** Opção pela retenção na fonte dispensada (art. 101.º-B CIRS). */
  withholdingExempt: boolean('withholding_exempt').notNull().default(false),
  addressLine: varchar('address_line', { length: 300 }),
  postalCode: varchar('postal_code', { length: 8 }),
  city: varchar('city', { length: 100 }),
  country: varchar('country', { length: 2 }).notNull().default('PT'),
  email: varchar('email', { length: 320 }),
  phone: varchar('phone', { length: 30 }),
  iban: text('iban_enc'),
  brandColor: varchar('brand_color', { length: 7 }),
  logoFileId: uuid('logo_file_id'),
  /** Consentimento para processamento por IA (pode ser desligado a qualquer momento). */
  aiEnabled: boolean('ai_enabled').notNull().default(true),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
});

export const memberships = pgTable(
  'memberships',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    role: membershipRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.accountId] }), index('memberships_account_idx').on(t.accountId)],
);

// ---------------------------------------------------------------------------
// Ficheiros (justificativos, PDFs, exportações). Encriptados em repouso.
// ---------------------------------------------------------------------------

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    kind: fileKindEnum('kind').notNull(),
    storageKey: varchar('storage_key', { length: 300 }).notNull(),
    originalName: varchar('original_name', { length: 300 }),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('files_account_idx').on(t.accountId)],
);

// ---------------------------------------------------------------------------
// Auditoria (append-only: o papel da app não tem UPDATE/DELETE)
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorType: actorTypeEnum('actor_type').notNull(),
    action: varchar('action', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 60 }),
    entityId: varchar('entity_id', { length: 64 }),
    data: jsonb('data').$type<Record<string, unknown>>(),
    ip: varchar('ip', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_account_created_idx').on(t.accountId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Notificações, fila de trabalhos, pedidos RGPD
// ---------------------------------------------------------------------------

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 60 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body'),
    link: varchar('link', { length: 300 }),
    dedupeKey: varchar('dedupe_key', { length: 200 }),
    readAt: timestamp('read_at', { withTimezone: true }),
    emailedAt: timestamp('emailed_at', { withTimezone: true }),
    pushedAt: timestamp('pushed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_account_idx').on(t.accountId, t.createdAt),
    uniqueIndex('notifications_dedupe_unique').on(t.accountId, t.dedupeKey),
  ],
);

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Fila de trabalhos em Postgres (SELECT ... FOR UPDATE SKIP LOCKED), compatível com o pooler do Neon. */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 60 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: jobStatusEnum('status').notNull().default('queued'),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    lastError: text('last_error'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: varchar('locked_by', { length: 100 }),
    dedupeKey: varchar('dedupe_key', { length: 200 }),
    ...timestamps,
  },
  (t) => [
    index('jobs_ready_idx').on(t.status, t.runAt),
    uniqueIndex('jobs_dedupe_unique').on(t.dedupeKey),
  ],
);

export const dataRequests = pgTable('data_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  type: dataRequestTypeEnum('type').notNull(),
  status: dataRequestStatusEnum('status').notNull().default('pending'),
  fileId: uuid('file_id'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
