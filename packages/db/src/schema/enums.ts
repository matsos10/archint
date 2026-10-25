import { pgEnum } from 'drizzle-orm/pg-core';

/** Estatuto jurídico da atividade. */
export const legalFormEnum = pgEnum('legal_form', [
  'trabalhador_independente', // recibos verdes, categoria B (art. 3.º CIRS)
  'eni', // empresário em nome individual, categoria B
  'unipessoal_lda', // sociedade unipessoal por quotas (IRC)
  'lda', // sociedade por quotas (IRC)
]);

/** Regime de IVA (CIVA). */
export const vatRegimeEnum = pgEnum('vat_regime', [
  'normal_mensal', // art. 41.º, n.º 1, a) CIVA
  'normal_trimestral', // art. 41.º, n.º 1, b) CIVA
  'isento_art53', // regime especial de isenção, art. 53.º CIVA
  'isento_art9', // isenção nas operações internas, art. 9.º CIVA (sem direito a dedução)
]);

/** Regime de tributação do rendimento. */
export const incomeTaxRegimeEnum = pgEnum('income_tax_regime', [
  'irs_simplificado', // art. 31.º CIRS
  'irs_contabilidade_organizada', // art. 32.º CIRS
  'irc_geral', // CIRC
]);

/** Região fiscal (taxas de IVA diferentes nas Regiões Autónomas, art. 18.º, n.º 3 CIVA). */
export const taxRegionEnum = pgEnum('tax_region', ['continente', 'madeira', 'acores']);

/** Tipo de rendimento da categoria B, que determina o coeficiente do regime simplificado. */
export const irsIncomeTypeEnum = pgEnum('irs_income_type', [
  'servicos_tabela_151', // art. 31.º, n.º 1, b) CIRS (coef. 0,75)
  'servicos_outros', // art. 31.º, n.º 1, c) CIRS (coef. 0,35)
  'vendas', // art. 31.º, n.º 1, a) CIRS (coef. 0,15)
  'hotelaria_restauracao', // art. 31.º, n.º 1, a) CIRS (coef. 0,15)
  'propriedade_intelectual', // art. 31.º, n.º 1, d) CIRS (coef. 0,95)
  'subsidios_exploracao', // coef. 0,10
  'subsidios_outros', // coef. 0,30
]);

export const membershipRoleEnum = pgEnum('membership_role', ['owner', 'admin', 'member', 'accountant']);

export const categoryKindEnum = pgEnum('category_kind', [
  'income',
  'expense',
  'transfer',
  'tax',
  'personal',
  'other',
]);

/** Código de taxa de IVA; o valor percentual resolve-se pelos parâmetros do ano e região. */
export const vatRateCodeEnum = pgEnum('vat_rate_code', [
  'normal',
  'intermedia',
  'reduzida',
  'isenta',
  'nao_sujeita',
  'autoliquidacao',
]);

export const transactionStatusEnum = pgEnum('transaction_status', [
  'to_review',
  'categorized',
  'reconciled',
  'ignored',
]);

export const categorySourceEnum = pgEnum('category_source', ['rule', 'ai', 'user', 'import', 'system']);

export const bankSourceEnum = pgEnum('bank_source', ['open_banking', 'csv', 'ofx', 'manual']);

export const bankConnectionStatusEnum = pgEnum('bank_connection_status', [
  'pending',
  'linked',
  'expired',
  'revoked',
  'error',
]);

export const receiptStatusEnum = pgEnum('receipt_status', [
  'uploaded',
  'processing',
  'extracted',
  'matched',
  'confirmed',
  'error',
]);

export const fileKindEnum = pgEnum('file_kind', [
  'receipt',
  'invoice_pdf',
  'quote_pdf',
  'declaration',
  'export',
  'logo',
  'import',
]);

export const invoiceDocTypeEnum = pgEnum('invoice_doc_type', [
  'FT', // fatura
  'FR', // fatura-recibo
  'FS', // fatura simplificada
  'NC', // nota de crédito
  'ND', // nota de débito
  'RC', // recibo
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'issued',
  'sent',
  'partially_paid',
  'paid',
  'cancelled',
]);

export const quoteStatusEnum = pgEnum('quote_status', [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
  'invoiced',
]);

export const obligationTypeEnum = pgEnum('obligation_type', [
  'iva_declaracao_periodica',
  'iva_pagamento',
  'irs_modelo3',
  'irs_pagamento_por_conta',
  'ss_declaracao_trimestral',
  'ss_pagamento_contribuicoes',
  'efatura_comunicacao',
  'saft_faturacao',
  'irc_modelo22',
  'irc_pagamento_por_conta',
  'ies',
  'dmr_retencoes',
  'ss_declaracao_remuneracoes',
  'modelo10',
]);

export const obligationStatusEnum = pgEnum('obligation_status', [
  'upcoming',
  'in_preparation',
  'ready',
  'submitted',
  'paid',
  'overdue',
  'not_applicable',
]);

export const declarationStatusEnum = pgEnum('declaration_status', [
  'draft',
  'ready_for_review',
  'confirmed',
  'submitted',
  'rejected',
]);

export const aiStatusEnum = pgEnum('ai_status', [
  'ok',
  'invalid_output',
  'error',
  'timeout',
  'rate_limited',
  'disabled',
]);

export const aiDecisionEnum = pgEnum('ai_decision', [
  'pending',
  'accepted',
  'rejected',
  'modified',
  'not_applicable',
]);

export const actorTypeEnum = pgEnum('actor_type', ['user', 'accountant', 'system', 'ai', 'admin']);

export const jobStatusEnum = pgEnum('job_status', ['queued', 'running', 'done', 'failed', 'dead']);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
]);

export const delegationStatusEnum = pgEnum('delegation_status', [
  'requested',
  'accepted',
  'declined',
  'revoked',
  'completed',
]);

export const insightTypeEnum = pgEnum('insight_type', ['anomaly', 'saving', 'alert', 'missing_document']);

export const insightStatusEnum = pgEnum('insight_status', ['open', 'dismissed', 'resolved']);

export const dataRequestTypeEnum = pgEnum('data_request_type', ['export', 'delete']);

export const dataRequestStatusEnum = pgEnum('data_request_status', ['pending', 'processing', 'done', 'failed']);

export const paramSetStatusEnum = pgEnum('param_set_status', ['draft', 'published', 'archived']);
