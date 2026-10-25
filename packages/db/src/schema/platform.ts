import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { accounts, timestamps, users } from './core';
import { aiDecisionEnum, aiStatusEnum, delegationStatusEnum, subscriptionStatusEnum } from './enums';

// ---------------------------------------------------------------------------
// Planos e subscrições
// ---------------------------------------------------------------------------

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 30 }).notNull().unique(),
  name: varchar('name', { length: 60 }).notNull(),
  priceMonthlyCents: integer('price_monthly_cents').notNull().default(0),
  priceYearlyCents: integer('price_yearly_cents').notNull().default(0),
  stripePriceMonthlyId: varchar('stripe_price_monthly_id', { length: 100 }),
  stripePriceYearlyId: varchar('stripe_price_yearly_id', { length: 100 }),
  features: jsonb('features').$type<string[]>().notNull().default([]),
  aiMonthlyQuota: integer('ai_monthly_quota').notNull().default(50),
  active: boolean('active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .unique()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  planId: uuid('plan_id')
    .notNull()
    .references(() => plans.id),
  status: subscriptionStatusEnum('status').notNull().default('active'),
  stripeCustomerId: varchar('stripe_customer_id', { length: 100 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 100 }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Contabilistas certificados parceiros e delegação
// ---------------------------------------------------------------------------

export const accountantPartners = pgTable('accountant_partners', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 200 }).notNull(),
  firmName: varchar('firm_name', { length: 200 }),
  /** Número de inscrição na Ordem dos Contabilistas Certificados. */
  occNumber: varchar('occ_number', { length: 20 }).notNull(),
  email: varchar('email', { length: 320 }).notNull(),
  city: varchar('city', { length: 100 }),
  bio: text('bio'),
  specialties: jsonb('specialties').$type<string[]>().notNull().default([]),
  services: jsonb('services')
    .$type<{ code: string; name: string; priceFromCents: number }[]>()
    .notNull()
    .default([]),
  rating: real('rating'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  active: boolean('active').notNull().default(true),
  ...timestamps,
});

export const delegationRequests = pgTable(
  'delegation_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => accountantPartners.id, { onDelete: 'cascade' }),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    /** Âmbitos delegados, ex.: ["read", "declarations", "certify_accounts"]. */
    scopes: jsonb('scopes').$type<string[]>().notNull(),
    serviceCode: varchar('service_code', { length: 40 }),
    message: text('message'),
    status: delegationStatusEnum('status').notNull().default('requested'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('delegations_account_idx').on(t.accountId)],
);

// ---------------------------------------------------------------------------
// IA: registo de cada pedido e da decisão do utilizador; chat
// ---------------------------------------------------------------------------

export const aiLogs = pgTable(
  'ai_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    feature: varchar('feature', { length: 40 }).notNull(),
    model: varchar('model', { length: 60 }),
    /** Pedido minimizado (sem dados desnecessários). */
    request: jsonb('request').$type<Record<string, unknown>>().notNull(),
    response: jsonb('response').$type<Record<string, unknown>>(),
    status: aiStatusEnum('status').notNull(),
    error: text('error'),
    proposal: jsonb('proposal').$type<Record<string, unknown>>(),
    decision: aiDecisionEnum('decision').notNull().default('pending'),
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    entityType: varchar('entity_type', { length: 40 }),
    entityId: uuid('entity_id'),
    latencyMs: integer('latency_ms'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_logs_account_created_idx').on(t.accountId, t.createdAt)],
);

export const chatThreads = pgTable('chat_threads', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 200 }),
  /** 'assistant' (IA) ou 'support' (equipa/contabilista). */
  channel: varchar('channel', { length: 20 }).notNull().default('assistant'),
  ...timestamps,
});

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => chatThreads.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull(),
    authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    content: text('content').notNull(),
    aiLogId: uuid('ai_log_id').references(() => aiLogs.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chat_messages_thread_idx').on(t.threadId, t.createdAt)],
);
