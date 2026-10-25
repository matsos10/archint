-- Isolamento multi-tenant por account_id com Row Level Security (defesa em profundidade).
--
-- Modelo:
--  * O papel de ligação (dono das tabelas, ex.: neondb_owner) é usado apenas por código
--    de plataforma (autenticação, worker, migrations) e não está sujeito a RLS.
--  * Todo o acesso a dados de uma conta corre dentro de uma transação com
--      SELECT set_config('app.account_id', <uuid>, true); SET LOCAL ROLE somar_app;
--    (ver packages/db/src/tenant.ts). O papel somar_app está sujeito a RLS e só vê
--    linhas da conta definida. Sem conta definida, não vê nada.
--  * SET LOCAL / set_config(..., true) limitam-se à transação, pelo que funcionam com
--    o pooler do Neon (PgBouncer em modo transaction).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'somar_app') THEN
    CREATE ROLE somar_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;
--> statement-breakpoint
GRANT somar_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO somar_app;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_current_account() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.account_id', true), '')::uuid $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_current_account() TO somar_app;
--> statement-breakpoint

-- Tabelas de conta: acesso completo, restrito à conta corrente.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'files', 'notifications', 'bank_connections', 'bank_accounts', 'transactions',
    'categorization_rules', 'receipts', 'insights', 'clients', 'document_series', 'quotes',
    'invoices', 'document_lines', 'payments', 'invoice_reminders', 'tax_obligations',
    'declarations', 'subscriptions', 'delegation_requests', 'ai_logs', 'chat_threads',
    'chat_messages'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO somar_app', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO somar_app USING (account_id = app_current_account()) WITH CHECK (account_id = app_current_account())',
      t
    );
  END LOOP;
END
$$;
--> statement-breakpoint

-- Conta: só a própria linha; não pode criar nem apagar contas no contexto de tenant.
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, UPDATE ON accounts TO somar_app;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON accounts TO somar_app
  USING (id = app_current_account()) WITH CHECK (id = app_current_account());
--> statement-breakpoint

-- Membros: leitura da equipa da conta corrente.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON memberships TO somar_app;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON memberships TO somar_app USING (account_id = app_current_account());
--> statement-breakpoint

-- Utilizadores: apenas colunas não sensíveis (nunca password_hash nem segredos 2FA).
GRANT SELECT (id, name, email) ON users TO somar_app;
--> statement-breakpoint

-- Categorias: as de sistema (account_id NULL) são legíveis por todos; escrita só nas próprias.
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON categories TO somar_app;
--> statement-breakpoint
CREATE POLICY categories_read ON categories FOR SELECT TO somar_app
  USING (account_id IS NULL OR account_id = app_current_account());
--> statement-breakpoint
CREATE POLICY categories_insert ON categories FOR INSERT TO somar_app
  WITH CHECK (account_id = app_current_account());
--> statement-breakpoint
CREATE POLICY categories_update ON categories FOR UPDATE TO somar_app
  USING (account_id = app_current_account()) WITH CHECK (account_id = app_current_account());
--> statement-breakpoint
CREATE POLICY categories_delete ON categories FOR DELETE TO somar_app
  USING (account_id = app_current_account());
--> statement-breakpoint

-- Auditoria: append-only para a app (sem UPDATE nem DELETE).
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_logs TO somar_app;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON audit_logs TO somar_app
  USING (account_id = app_current_account()) WITH CHECK (account_id = app_current_account());
--> statement-breakpoint

-- Fila de trabalhos: a app pode enfileirar e consultar trabalhos da própria conta.
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT ON jobs TO somar_app;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON jobs TO somar_app
  USING (account_id = app_current_account()) WITH CHECK (account_id = app_current_account());
--> statement-breakpoint

-- Tabelas globais de referência: só leitura.
GRANT SELECT ON plans, tax_parameter_sets, accountant_partners TO somar_app;
