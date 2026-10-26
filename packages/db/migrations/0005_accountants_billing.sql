CREATE TABLE "stripe_events" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"type" varchar(100) NOT NULL,
	"account_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delegation_requests" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "billing_interval" varchar(10);--> statement-breakpoint
ALTER TABLE "stripe_events" ADD CONSTRAINT "stripe_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delegations_partner_idx" ON "delegation_requests" USING btree ("partner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delegations_open_unique" ON "delegation_requests" USING btree ("account_id","partner_id") WHERE status in ('requested', 'accepted');--> statement-breakpoint
ALTER TABLE "accountant_partners" ADD CONSTRAINT "accountant_partners_user_id_unique" UNIQUE("user_id");--> statement-breakpoint

-- Acesso só de leitura (contabilista com delegação "consulta"): o mesmo isolamento por conta,
-- mas sem permissões de escrita. Imposto pelo Postgres, não só pela aplicação.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'somar_readonly') THEN
    CREATE ROLE somar_readonly NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;
--> statement-breakpoint
GRANT somar_readonly TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO somar_readonly;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_current_account() TO somar_readonly;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'files', 'notifications', 'bank_connections', 'bank_accounts', 'transactions',
    'categorization_rules', 'receipts', 'insights', 'clients', 'document_series', 'quotes',
    'invoices', 'document_lines', 'payments', 'invoice_reminders', 'tax_obligations',
    'declarations', 'subscriptions', 'delegation_requests', 'ai_logs', 'chat_threads',
    'chat_messages', 'accounts', 'memberships', 'audit_logs', 'jobs'
  ]
  LOOP
    EXECUTE format('GRANT SELECT ON %I TO somar_readonly', t);
    EXECUTE format('ALTER POLICY tenant_isolation ON %I TO somar_app, somar_readonly', t);
  END LOOP;
END
$$;
--> statement-breakpoint
GRANT SELECT ON categories TO somar_readonly;
--> statement-breakpoint
ALTER POLICY categories_read ON categories TO somar_app, somar_readonly;
--> statement-breakpoint
GRANT SELECT (id, name, email) ON users TO somar_readonly;
--> statement-breakpoint
GRANT SELECT ON plans, tax_parameter_sets, accountant_partners TO somar_readonly;
--> statement-breakpoint
-- O registo de acessos do contabilista é escrito mesmo em modo de consulta (append-only).
GRANT INSERT ON audit_logs TO somar_readonly;
--> statement-breakpoint
-- Eventos do Stripe: só o papel de plataforma (dono) lhes acede; RLS ativa sem políticas nega tudo à app.
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
