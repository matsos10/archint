CREATE TYPE "public"."actor_type" AS ENUM('user', 'accountant', 'system', 'ai', 'admin');--> statement-breakpoint
CREATE TYPE "public"."ai_decision" AS ENUM('pending', 'accepted', 'rejected', 'modified', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."ai_status" AS ENUM('ok', 'invalid_output', 'error', 'timeout', 'rate_limited', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."bank_connection_status" AS ENUM('pending', 'linked', 'expired', 'revoked', 'error');--> statement-breakpoint
CREATE TYPE "public"."bank_source" AS ENUM('open_banking', 'csv', 'ofx', 'manual');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense', 'transfer', 'tax', 'personal', 'other');--> statement-breakpoint
CREATE TYPE "public"."category_source" AS ENUM('rule', 'ai', 'user', 'import', 'system');--> statement-breakpoint
CREATE TYPE "public"."data_request_status" AS ENUM('pending', 'processing', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."data_request_type" AS ENUM('export', 'delete');--> statement-breakpoint
CREATE TYPE "public"."declaration_status" AS ENUM('draft', 'ready_for_review', 'confirmed', 'submitted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."delegation_status" AS ENUM('requested', 'accepted', 'declined', 'revoked', 'completed');--> statement-breakpoint
CREATE TYPE "public"."file_kind" AS ENUM('receipt', 'invoice_pdf', 'quote_pdf', 'declaration', 'export', 'logo', 'import');--> statement-breakpoint
CREATE TYPE "public"."income_tax_regime" AS ENUM('irs_simplificado', 'irs_contabilidade_organizada', 'irc_geral');--> statement-breakpoint
CREATE TYPE "public"."insight_status" AS ENUM('open', 'dismissed', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."insight_type" AS ENUM('anomaly', 'saving', 'alert', 'missing_document');--> statement-breakpoint
CREATE TYPE "public"."invoice_doc_type" AS ENUM('FT', 'FR', 'FS', 'NC', 'ND', 'RC');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'sent', 'partially_paid', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."irs_income_type" AS ENUM('servicos_tabela_151', 'servicos_outros', 'vendas', 'hotelaria_restauracao', 'propriedade_intelectual', 'subsidios_exploracao', 'subsidios_outros');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed', 'dead');--> statement-breakpoint
CREATE TYPE "public"."legal_form" AS ENUM('trabalhador_independente', 'eni', 'unipessoal_lda', 'lda');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'admin', 'member', 'accountant');--> statement-breakpoint
CREATE TYPE "public"."obligation_status" AS ENUM('upcoming', 'in_preparation', 'ready', 'submitted', 'paid', 'overdue', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."obligation_type" AS ENUM('iva_declaracao_periodica', 'iva_pagamento', 'irs_modelo3', 'irs_pagamento_por_conta', 'ss_declaracao_trimestral', 'ss_pagamento_contribuicoes', 'efatura_comunicacao', 'saft_faturacao', 'irc_modelo22', 'irc_pagamento_por_conta', 'ies', 'dmr_retencoes', 'ss_declaracao_remuneracoes', 'modelo10');--> statement-breakpoint
CREATE TYPE "public"."param_set_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'accepted', 'rejected', 'expired', 'invoiced');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('uploaded', 'processing', 'extracted', 'matched', 'confirmed', 'error');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."tax_region" AS ENUM('continente', 'madeira', 'acores');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('to_review', 'categorized', 'reconciled', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."vat_rate_code" AS ENUM('normal', 'intermedia', 'reduzida', 'isenta', 'nao_sujeita', 'autoliquidacao');--> statement-breakpoint
CREATE TYPE "public"."vat_regime" AS ENUM('normal_mensal', 'normal_trimestral', 'isento_art53', 'isento_art9');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"legal_form" "legal_form" NOT NULL,
	"nif" varchar(9),
	"vat_regime" "vat_regime" NOT NULL,
	"income_tax_regime" "income_tax_regime" NOT NULL,
	"tax_region" "tax_region" DEFAULT 'continente' NOT NULL,
	"activity_start_date" date NOT NULL,
	"cae" varchar(5),
	"cirs_activity_code" varchar(4),
	"main_income_type" "irs_income_type",
	"has_employment_income" boolean DEFAULT false NOT NULL,
	"withholding_exempt" boolean DEFAULT false NOT NULL,
	"address_line" varchar(300),
	"postal_code" varchar(8),
	"city" varchar(100),
	"country" varchar(2) DEFAULT 'PT' NOT NULL,
	"email" varchar(320),
	"phone" varchar(30),
	"iban_enc" text,
	"brand_color" varchar(7),
	"logo_file_id" uuid,
	"onboarding_completed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"actor_user_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(60),
	"entity_id" varchar(64),
	"data" jsonb,
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" uuid,
	"type" "data_request_type" NOT NULL,
	"status" "data_request_status" DEFAULT 'pending' NOT NULL,
	"file_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "file_kind" NOT NULL,
	"storage_key" varchar(300) NOT NULL,
	"original_name" varchar(300),
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"type" varchar(60) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(100),
	"dedupe_key" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"role" "membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_id_account_id_pk" PRIMARY KEY("user_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid,
	"type" varchar(60) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"link" varchar(300),
	"dedupe_key" varchar(200),
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"pushed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(200) PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"active_account_id" uuid,
	"two_factor_verified" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" varchar(64),
	"user_agent" varchar(400),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(200) NOT NULL,
	"password_hash" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"totp_secret_enc" text,
	"totp_enabled_at" timestamp with time zone,
	"totp_last_used_step" bigint,
	"recovery_code_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locale" varchar(10) DEFAULT 'pt-PT' NOT NULL,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"connection_id" uuid,
	"source" "bank_source" NOT NULL,
	"name" varchar(200) NOT NULL,
	"iban_enc" text,
	"iban_last4" varchar(4),
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"external_id" varchar(200),
	"balance_cents" bigint,
	"balance_at" timestamp with time zone,
	"is_business" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" varchar(40) NOT NULL,
	"institution_id" varchar(100) NOT NULL,
	"institution_name" varchar(200),
	"external_ref_enc" text,
	"status" "bank_connection_status" DEFAULT 'pending' NOT NULL,
	"consent_expires_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid,
	"code" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"kind" "category_kind" NOT NULL,
	"parent_id" uuid,
	"deductible" boolean DEFAULT false NOT NULL,
	"deductible_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
	"default_vat_rate" "vat_rate_code",
	"vat_deductible_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
	"irs_income_type" "irs_income_type",
	"snc_account" varchar(12),
	"requires_receipt" boolean DEFAULT true NOT NULL,
	"legal_note" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorization_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"match_field" varchar(20) DEFAULT 'description' NOT NULL,
	"match_type" varchar(20) DEFAULT 'contains' NOT NULL,
	"pattern" varchar(200) NOT NULL,
	"direction" varchar(10) DEFAULT 'any' NOT NULL,
	"category_id" uuid NOT NULL,
	"vat_rate_code" "vat_rate_code",
	"priority" integer DEFAULT 100 NOT NULL,
	"created_from" varchar(20) DEFAULT 'user' NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"type" "insight_type" NOT NULL,
	"code" varchar(60) NOT NULL,
	"severity" varchar(10) DEFAULT 'info' NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"entity_type" varchar(40),
	"entity_id" uuid,
	"data" jsonb,
	"source" varchar(10) DEFAULT 'rule' NOT NULL,
	"status" "insight_status" DEFAULT 'open' NOT NULL,
	"dedupe_key" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"transaction_id" uuid,
	"status" "receipt_status" DEFAULT 'uploaded' NOT NULL,
	"extracted" jsonb,
	"extraction_confidence" real,
	"supplier_nif" varchar(9),
	"supplier_name" varchar(200),
	"document_number" varchar(60),
	"atcud" varchar(100),
	"document_date" date,
	"total_cents" bigint,
	"vat_cents" bigint,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"booking_date" date NOT NULL,
	"value_date" date,
	"amount_cents" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"description" text NOT NULL,
	"counterparty" varchar(200),
	"external_id" varchar(200),
	"fingerprint" varchar(64) NOT NULL,
	"category_id" uuid,
	"category_source" "category_source",
	"category_confidence" real,
	"status" "transaction_status" DEFAULT 'to_review' NOT NULL,
	"vat_rate_code" "vat_rate_code",
	"vat_cents" bigint,
	"business_pct" numeric(5, 2) DEFAULT 100 NOT NULL,
	"invoice_id" uuid,
	"duplicate_of_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"nif" varchar(20),
	"email" varchar(320),
	"address_line" varchar(300),
	"postal_code" varchar(10),
	"city" varchar(100),
	"country" varchar(2) DEFAULT 'PT' NOT NULL,
	"is_company" boolean DEFAULT true NOT NULL,
	"has_organized_accounting" boolean DEFAULT true NOT NULL,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"invoice_id" uuid,
	"quote_id" uuid,
	"position" integer NOT NULL,
	"description" varchar(500) NOT NULL,
	"quantity" numeric(12, 3) DEFAULT 1 NOT NULL,
	"unit" varchar(20) DEFAULT 'un' NOT NULL,
	"unit_price_cents" bigint NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
	"vat_rate_code" "vat_rate_code" NOT NULL,
	"vat_rate_pct" numeric(5, 2) NOT NULL,
	"vat_exemption_code" varchar(3),
	"net_cents" bigint NOT NULL,
	"vat_cents" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"doc_type" varchar(4) NOT NULL,
	"code" varchar(20) NOT NULL,
	"year" integer NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"at_validation_code" varchar(20),
	"provider_series_id" varchar(100),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"stage" integer NOT NULL,
	"channel" varchar(20) DEFAULT 'email' NOT NULL,
	"subject" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"doc_type" "invoice_doc_type" DEFAULT 'FT' NOT NULL,
	"series_id" uuid,
	"number" varchar(40),
	"sequence" integer,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"due_date" date,
	"atcud" varchar(100),
	"qr_payload" text,
	"document_hash" varchar(200),
	"provider" varchar(40),
	"provider_ref" varchar(100),
	"related_invoice_id" uuid,
	"paid_cents" bigint DEFAULT 0 NOT NULL,
	"paid_at" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"reminders_enabled" boolean DEFAULT true NOT NULL,
	"last_reminder_at" timestamp with time zone,
	"client_id" uuid,
	"client_snapshot" jsonb,
	"issue_date" date NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"net_cents" bigint DEFAULT 0 NOT NULL,
	"vat_cents" bigint DEFAULT 0 NOT NULL,
	"withholding_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"pdf_file_id" uuid,
	"sent_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"method" varchar(30) DEFAULT 'transferencia' NOT NULL,
	"transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"number" varchar(40),
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"valid_until" date,
	"invoice_id" uuid,
	"client_id" uuid,
	"client_snapshot" jsonb,
	"issue_date" date NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"net_cents" bigint DEFAULT 0 NOT NULL,
	"vat_cents" bigint DEFAULT 0 NOT NULL,
	"withholding_cents" bigint DEFAULT 0 NOT NULL,
	"total_cents" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"pdf_file_id" uuid,
	"sent_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"obligation_id" uuid,
	"type" "obligation_type" NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "declaration_status" DEFAULT 'draft' NOT NULL,
	"data" jsonb NOT NULL,
	"engine_version" varchar(20) NOT NULL,
	"param_set_id" uuid,
	"file_id" uuid,
	"confirmed_by" uuid,
	"confirmed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"submission_ref" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"type" "obligation_type" NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"period_label" varchar(40) NOT NULL,
	"window_start" date,
	"due_date" date NOT NULL,
	"status" "obligation_status" DEFAULT 'upcoming' NOT NULL,
	"amount_estimate_cents" bigint,
	"declaration_id" uuid,
	"legal_ref" varchar(200),
	"last_notified_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_parameter_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"version" integer NOT NULL,
	"status" "param_set_status" DEFAULT 'draft' NOT NULL,
	"params" jsonb NOT NULL,
	"notes" text,
	"created_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accountant_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" varchar(200) NOT NULL,
	"firm_name" varchar(200),
	"occ_number" varchar(20) NOT NULL,
	"email" varchar(320) NOT NULL,
	"city" varchar(100),
	"bio" text,
	"specialties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"services" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rating" real,
	"verified_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid,
	"feature" varchar(40) NOT NULL,
	"model" varchar(60),
	"request" jsonb NOT NULL,
	"response" jsonb,
	"status" "ai_status" NOT NULL,
	"error" text,
	"proposal" jsonb,
	"decision" "ai_decision" DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"entity_type" varchar(40),
	"entity_id" uuid,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"author_user_id" uuid,
	"content" text NOT NULL,
	"ai_log_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid,
	"title" varchar(200),
	"channel" varchar(20) DEFAULT 'assistant' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delegation_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"partner_id" uuid NOT NULL,
	"requested_by" uuid,
	"scopes" jsonb NOT NULL,
	"service_code" varchar(40),
	"message" text,
	"status" "delegation_status" DEFAULT 'requested' NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(30) NOT NULL,
	"name" varchar(60) NOT NULL,
	"price_monthly_cents" integer DEFAULT 0 NOT NULL,
	"price_yearly_cents" integer DEFAULT 0 NOT NULL,
	"stripe_price_monthly_id" varchar(100),
	"stripe_price_yearly_id" varchar(100),
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_monthly_quota" integer DEFAULT 50 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"stripe_customer_id" varchar(100),
	"stripe_subscription_id" varchar(100),
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_account_id_accounts_id_fk" FOREIGN KEY ("active_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_connection_id_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_duplicate_of_id_transactions_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_series" ADD CONSTRAINT "document_series_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_series_id_document_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."document_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pdf_file_id_files_id_fk" FOREIGN KEY ("pdf_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_pdf_file_id_files_id_fk" FOREIGN KEY ("pdf_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_obligation_id_tax_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."tax_obligations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_param_set_id_tax_parameter_sets_id_fk" FOREIGN KEY ("param_set_id") REFERENCES "public"."tax_parameter_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declarations" ADD CONSTRAINT "declarations_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_obligations" ADD CONSTRAINT "tax_obligations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_parameter_sets" ADD CONSTRAINT "tax_parameter_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accountant_partners" ADD CONSTRAINT "accountant_partners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_logs" ADD CONSTRAINT "ai_logs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_logs" ADD CONSTRAINT "ai_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_logs" ADD CONSTRAINT "ai_logs_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_ai_log_id_ai_logs_id_fk" FOREIGN KEY ("ai_log_id") REFERENCES "public"."ai_logs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegation_requests" ADD CONSTRAINT "delegation_requests_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegation_requests" ADD CONSTRAINT "delegation_requests_partner_id_accountant_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."accountant_partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delegation_requests" ADD CONSTRAINT "delegation_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_account_created_idx" ON "audit_logs" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "files_account_idx" ON "files" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "jobs_ready_idx" ON "jobs" USING btree ("status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_unique" ON "jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "memberships_account_idx" ON "memberships" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "notifications_account_idx" ON "notifications" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_unique" ON "notifications" USING btree ("account_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "bank_accounts_account_idx" ON "bank_accounts" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_account_code_unique" ON "categories" USING btree ("account_id","code");--> statement-breakpoint
CREATE INDEX "rules_account_idx" ON "categorization_rules" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "insights_dedupe_unique" ON "insights" USING btree ("account_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "receipts_account_idx" ON "receipts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "receipts_tx_idx" ON "receipts" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transactions_account_date_idx" ON "transactions" USING btree ("account_id","booking_date");--> statement-breakpoint
CREATE INDEX "transactions_fingerprint_idx" ON "transactions" USING btree ("account_id","fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_external_unique" ON "transactions" USING btree ("bank_account_id","external_id");--> statement-breakpoint
CREATE INDEX "clients_account_idx" ON "clients" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "lines_invoice_idx" ON "document_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "lines_quote_idx" ON "document_lines" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "series_unique" ON "document_series" USING btree ("account_id","doc_type","code");--> statement-breakpoint
CREATE INDEX "invoices_account_date_idx" ON "invoices" USING btree ("account_id","issue_date");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_series_seq_unique" ON "invoices" USING btree ("series_id","sequence");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "quotes_account_idx" ON "quotes" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "declarations_account_idx" ON "declarations" USING btree ("account_id","period_start");--> statement-breakpoint
CREATE INDEX "obligations_account_due_idx" ON "tax_obligations" USING btree ("account_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "obligations_unique" ON "tax_obligations" USING btree ("account_id","type","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_params_year_version_unique" ON "tax_parameter_sets" USING btree ("year","version");--> statement-breakpoint
CREATE INDEX "ai_logs_account_created_idx" ON "ai_logs" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_idx" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "delegations_account_idx" ON "delegation_requests" USING btree ("account_id");