import { and, desc, eq, gte, isNull, ne, notInArray, or, sql } from 'drizzle-orm';
import {
  accounts,
  aiLogs,
  categories,
  chatMessages,
  chatThreads,
  files,
  insights,
  plans,
  receipts,
  subscriptions,
  transactions,
  type TenantTx,
} from '@somar/db';
import {
  ASSISTANT_DISCLAIMER,
  OPTIMIZATION_ACTIONS,
  anomalyFeature,
  assistantFeature,
  categorizeFeature,
  deductibilityFeature,
  explainFeature,
  optimizationFeature,
  receiptFeature,
  reminderFeature,
  runFeature,
  type AiDeps,
  type AiLogEntry,
  type Explanation,
  type LlmClient,
  type OptimizationAction,
} from '@somar/ai';
import { compareIrsRegimes, computeSocialSecurity, type TaxParams } from '@somar/tax-engine';
import { buildYearData } from './accounting';
import { correctCategory } from './categorize';
import { AppError } from './errors';
import { formatEurPlain } from './format';
import { autoMatchReceipts } from './receipts';
import { audit } from './audit';
import type { FileStorage } from './storage';
import type { LoadedParams } from './tax';
import type { ReminderComposer } from './invoicing/service';

type Ctx = { accountId: string; userId?: string | null };

export const AI_PER_MINUTE_LIMIT = 20;
const DEFAULT_MONTHLY_QUOTA = 30;

/**
 * Dependências de IA para uma conta: quota mensal do plano + limite por minuto por utilizador,
 * e registo de cada pedido em ai_logs (pedido minimizado, resposta, estado, proposta, latência).
 */
export function aiDeps(tx: TenantTx, ctx: Ctx, llm: LlmClient | null, entity?: { type: string; id?: string }): AiDeps {
  return {
    llm,
    allow: async () => {
      const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
      const [{ used } = { used: 0 }] = await tx
        .select({ used: sql<number>`count(*)::int` })
        .from(aiLogs)
        .where(and(eq(aiLogs.accountId, ctx.accountId), gte(aiLogs.createdAt, monthStart), notInArray(aiLogs.status, ['disabled', 'rate_limited'])));
      const [quota] = await tx
        .select({ q: plans.aiMonthlyQuota })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(eq(subscriptions.accountId, ctx.accountId));
      if (used >= (quota?.q ?? DEFAULT_MONTHLY_QUOTA)) return false;
      if (ctx.userId) {
        const [{ recent } = { recent: 0 }] = await tx
          .select({ recent: sql<number>`count(*)::int` })
          .from(aiLogs)
          .where(and(eq(aiLogs.userId, ctx.userId), gte(aiLogs.createdAt, new Date(Date.now() - 60_000))));
        if (recent >= AI_PER_MINUTE_LIMIT) return false;
      }
      return true;
    },
    log: async (e: AiLogEntry) => {
      const [row] = await tx
        .insert(aiLogs)
        .values({
          accountId: ctx.accountId,
          userId: ctx.userId ?? null,
          feature: e.feature,
          model: e.model,
          request: e.request,
          response: e.response,
          status: e.status,
          error: e.error,
          proposal: e.proposal,
          decision: e.proposal ? 'pending' : 'not_applicable',
          entityType: entity?.type,
          entityId: entity?.id,
          latencyMs: e.latencyMs,
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens,
        })
        .returning({ id: aiLogs.id });
      return row?.id;
    },
  };
}

/** Regista a decisão do utilizador sobre uma proposta da IA (aceite, rejeitada, modificada). */
export async function recordAiDecision(tx: TenantTx, ctx: { accountId: string; userId: string }, logId: string, decision: 'accepted' | 'rejected' | 'modified') {
  await tx
    .update(aiLogs)
    .set({ decision, decidedBy: ctx.userId, decidedAt: new Date() })
    .where(and(eq(aiLogs.id, logId), eq(aiLogs.accountId, ctx.accountId)));
}

// ---------------------------------------------------------------------------
// 1. Categorização (depois das regras) — fica sempre "por rever"
// ---------------------------------------------------------------------------

export async function aiCategorizePending(tx: TenantTx, ctx: Ctx, llm: LlmClient | null, opts: { limit?: number } = {}) {
  const pending = await tx
    .select({ id: transactions.id, date: transactions.bookingDate, description: transactions.description, amountCents: transactions.amountCents })
    .from(transactions)
    .where(and(eq(transactions.accountId, ctx.accountId), isNull(transactions.categoryId), isNull(transactions.duplicateOfId), ne(transactions.status, 'ignored')))
    .orderBy(desc(transactions.bookingDate))
    .limit(opts.limit ?? 50);
  if (!pending.length) return { status: 'ok' as const, applied: 0 };
  const cats = await tx
    .select({ id: categories.id, code: categories.code, name: categories.name, kind: categories.kind, accountId: categories.accountId })
    .from(categories)
    .where(or(isNull(categories.accountId), eq(categories.accountId, ctx.accountId)));
  const examples = await tx
    .select({ description: transactions.description, categoryCode: categories.code })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.accountId, ctx.accountId), eq(transactions.categorySource, 'user')))
    .orderBy(desc(transactions.updatedAt))
    .limit(40);
  const r = await runFeature(categorizeFeature, { transactions: pending, categories: cats, examples }, aiDeps(tx, ctx, llm, { type: 'transaction_batch' }));
  if (!r.proposal) return { status: r.status, applied: 0 };
  const byCode = new Map(cats.map((c) => [c.code, c.id]));
  let applied = 0;
  for (const it of r.proposal.items) {
    if (it.confidence < 0.4) continue; // demasiado incerto: fica por categorizar
    await tx
      .update(transactions)
      .set({ categoryId: byCode.get(it.categoryCode)!, categorySource: 'ai', categoryConfidence: it.confidence, status: 'to_review', aiLogId: r.logId ?? null })
      .where(and(eq(transactions.id, it.id), eq(transactions.accountId, ctx.accountId), isNull(transactions.categoryId)));
    applied++;
  }
  return { status: r.status, applied };
}

/** O utilizador aceita (ou corrige) uma sugestão de categoria da IA. */
export async function confirmAiCategory(tx: TenantTx, ctx: { accountId: string; userId: string }, transactionId: string, categoryId?: string) {
  const [t] = await tx.select().from(transactions).where(and(eq(transactions.id, transactionId), eq(transactions.accountId, ctx.accountId)));
  if (!t?.categoryId) throw new AppError('not_found', 'Movimento não encontrado.', 404);
  const modified = categoryId && categoryId !== t.categoryId;
  await correctCategory(tx, ctx.accountId, transactionId, categoryId ?? t.categoryId);
  if (t.aiLogId && t.categorySource === 'ai') await recordAiDecision(tx, ctx, t.aiLogId, modified ? 'modified' : 'accepted');
}

// ---------------------------------------------------------------------------
// 2. OCR de justificativos — os valores ficam como proposta até confirmação
// ---------------------------------------------------------------------------

export async function aiExtractReceipt(tx: TenantTx, deps: { llm: LlmClient | null; storage: FileStorage; params: TaxParams }, ctx: Ctx, receiptId: string) {
  const [row] = await tx
    .select({ r: receipts, f: files, nif: accounts.nif, region: accounts.taxRegion })
    .from(receipts)
    .innerJoin(files, eq(files.id, receipts.fileId))
    .innerJoin(accounts, eq(accounts.id, receipts.accountId))
    .where(and(eq(receipts.id, receiptId), eq(receipts.accountId, ctx.accountId)));
  if (!row) throw new AppError('not_found', 'Justificativo não encontrado.', 404);
  if (row.r.status === 'confirmed') return { status: 'ok' as const, updated: false };
  await tx.update(receipts).set({ status: 'processing' }).where(eq(receipts.id, receiptId));
  const data = await deps.storage.get(row.f.storageKey);
  const r = await runFeature(
    receiptFeature,
    { file: { mimeType: row.f.mimeType, base64: data.toString('base64') }, accountNif: row.nif, region: row.region, params: deps.params },
    aiDeps(tx, ctx, deps.llm, { type: 'receipt', id: receiptId }),
  );
  if (!r.proposal) {
    await tx.update(receipts).set({ status: row.r.totalCents != null ? 'extracted' : 'uploaded' }).where(eq(receipts.id, receiptId));
    return { status: r.status, updated: false };
  }
  const p = r.proposal;
  await tx
    .update(receipts)
    .set({
      status: 'extracted',
      extracted: { source: 'ai', ...p },
      extractionConfidence: p.confidence,
      supplierName: p.supplierName ?? row.r.supplierName,
      supplierNif: p.supplierNif ?? row.r.supplierNif,
      documentNumber: p.documentNumber ?? row.r.documentNumber,
      atcud: p.atcud ?? row.r.atcud,
      documentDate: p.documentDate ?? row.r.documentDate,
      totalCents: p.totalCents ?? row.r.totalCents,
      vatCents: p.vatCents ?? row.r.vatCents,
      aiLogId: r.logId ?? null,
    })
    .where(eq(receipts.id, receiptId));
  await autoMatchReceipts(tx, ctx.accountId);
  return { status: r.status, updated: true };
}

// ---------------------------------------------------------------------------
// 3. Natureza da despesa (IVA dedutível) e % profissional
// ---------------------------------------------------------------------------

export async function aiSuggestDeductibility(tx: TenantTx, ctx: Ctx, llm: LlmClient | null, params: TaxParams, transactionId: string) {
  const [row] = await tx
    .select({ t: transactions, c: categories })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.id, transactionId), eq(transactions.accountId, ctx.accountId)));
  if (!row) throw new AppError('not_found', 'Movimento não encontrado.', 404);
  const r = await runFeature(
    deductibilityFeature,
    { description: row.t.description, amountCents: row.t.amountCents, categoryName: row.c?.name ?? 'sem categoria', keys: Object.keys(params.vat.deductibility) },
    aiDeps(tx, ctx, llm, { type: 'transaction', id: transactionId }),
  );
  // O % de IVA dedutível vem sempre dos parâmetros fiscais (motor), nunca da IA.
  return r.proposal ? { ...r.proposal, vatDeductiblePct: params.vat.deductibility[r.proposal.vatDeductionKey]!, logId: r.logId } : null;
}

// ---------------------------------------------------------------------------
// 4. Explicações em linguagem simples (com alternativa determinística)
// ---------------------------------------------------------------------------

export function deterministicExplanation(title: string, facts: { label: string; amountCents?: number; legalRef?: string }[]): Explanation {
  return {
    title,
    paragraphs: [
      facts.map((f) => `${f.label}${f.amountCents != null ? `: ${formatEurPlain(f.amountCents)}` : ''}${f.legalRef ? ` (${f.legalRef})` : ''}.`).join(' '),
    ],
  };
}

export async function explainWithAi(tx: TenantTx, ctx: Ctx, llm: LlmClient | null, input: { title: string; question: string; facts: { label: string; amountCents?: number; legalRef?: string }[] }) {
  const r = await runFeature(explainFeature, { question: input.question, facts: input.facts }, aiDeps(tx, ctx, llm, { type: 'explanation' }));
  return { explanation: r.proposal ?? deterministicExplanation(input.title, input.facts), aiGenerated: !!r.proposal, status: r.status };
}

// ---------------------------------------------------------------------------
// 5. Assistente de chat
// ---------------------------------------------------------------------------

export const ASSISTANT_UNAVAILABLE =
  'O assistente não está disponível neste momento. Podes consultar o calendário e as estimativas em "Impostos", ou pedir ajuda a um contabilista certificado parceiro.';

export async function askAssistant(tx: TenantTx, deps: { llm: LlmClient | null; loaded: LoadedParams }, ctx: { accountId: string; userId: string }, input: { threadId?: string; question: string }) {
  const question = input.question.trim().slice(0, 2000);
  if (question.length < 2) throw new AppError('empty', 'Escreve a tua pergunta.');
  let threadId = input.threadId;
  if (threadId) {
    const [t] = await tx.select().from(chatThreads).where(and(eq(chatThreads.id, threadId), eq(chatThreads.accountId, ctx.accountId)));
    if (!t) throw new AppError('not_found', 'Conversa não encontrada.', 404);
  } else {
    const [t] = await tx.insert(chatThreads).values({ accountId: ctx.accountId, userId: ctx.userId, title: question.slice(0, 80) }).returning();
    threadId = t!.id;
  }
  const history = (await tx.select().from(chatMessages).where(eq(chatMessages.threadId, threadId)).orderBy(chatMessages.createdAt)).slice(-8);
  await tx.insert(chatMessages).values({ accountId: ctx.accountId, threadId, role: 'user', authorUserId: ctx.userId, content: question });

  const [account] = await tx.select().from(accounts).where(eq(accounts.id, ctx.accountId));
  const year = new Date().getUTCFullYear();
  const yd = await buildYearData(tx, ctx.accountId, year, deps.loaded);
  const figures = [
    { label: `Receitas de ${year} (sem IVA)`, amountCents: yd.summary.incomeNetCents },
    { label: `Despesas de ${year}`, amountCents: yd.summary.expensesCents },
    { label: `IVA a pagar em ${year} (estimativa)`, amountCents: yd.summary.vatPayableCents },
    { label: `Imposto sobre o rendimento ${year} (estimativa)`, amountCents: yd.summary.incomeTaxCents },
    { label: `Resultado do IRS ${year} após retenções (positivo = a pagar)`, amountCents: yd.summary.incomeTaxResultCents },
    { label: `Segurança Social ${year}`, amountCents: yd.summary.socialSecurityCents },
    { label: 'Retenções na fonte', amountCents: yd.summary.withholdingCents },
  ];
  const r = await runFeature(
    assistantFeature,
    {
      question,
      profile: {
        estatuto: account!.legalForm,
        regimeIva: account!.vatRegime,
        regimeRendimento: account!.incomeTaxRegime,
        regiao: account!.taxRegion,
        inicioAtividade: account!.activityStartDate,
        tipoRendimento: account!.mainIncomeType ?? '',
      },
      figures,
      history: history.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role as 'user', content: m.content })),
    },
    aiDeps(tx, ctx, deps.llm, { type: 'chat_thread', id: threadId }),
  );
  const answer = r.proposal
    ? `${r.proposal.answer}${r.issues.length ? `\n\n⚠️ ${r.issues.join(' ')}` : ''}${r.proposal.needsAccountant ? '\n\nRecomendo confirmar com um contabilista certificado.' : ''}\n\n_${ASSISTANT_DISCLAIMER}_`
    : ASSISTANT_UNAVAILABLE;
  await tx.insert(chatMessages).values({ accountId: ctx.accountId, threadId, role: 'assistant', content: answer, aiLogId: r.logId ?? null });
  await tx.update(chatThreads).set({ updatedAt: new Date() }).where(eq(chatThreads.id, threadId));
  return { threadId, answer, status: r.status, followUps: r.proposal?.followUps ?? [] };
}

// ---------------------------------------------------------------------------
// 6. Anomalias (complementam as regras; nunca alteram dados)
// ---------------------------------------------------------------------------

export async function aiDetectAnomalies(tx: TenantTx, ctx: Ctx, llm: LlmClient | null, opts: { since?: string } = {}) {
  const since = opts.since ?? new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
  const rows = await tx
    .select({ id: transactions.id, date: transactions.bookingDate, description: transactions.description, amountCents: transactions.amountCents, category: categories.code, receipt: receipts.id })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(receipts, eq(receipts.transactionId, transactions.id))
    .where(and(eq(transactions.accountId, ctx.accountId), gte(transactions.bookingDate, since), ne(transactions.status, 'ignored')))
    .limit(300);
  if (!rows.length) return { status: 'ok' as const, found: 0 };
  const r = await runFeature(anomalyFeature, { transactions: rows.map((x) => ({ id: x.id, date: x.date, description: x.description, amountCents: x.amountCents, category: x.category, hasReceipt: !!x.receipt })) }, aiDeps(tx, ctx, llm, { type: 'anomaly_scan' }));
  if (!r.proposal) return { status: r.status, found: 0 };
  const titles: Record<string, string> = { duplicate: 'Possível duplicado', unusual_amount: 'Montante invulgar', personal_expense: 'Possível despesa pessoal', missing_invoice: 'Possível fatura em falta', other: 'Movimento a verificar' };
  for (const it of r.proposal.items) {
    const t = rows.find((x) => x.id === it.id)!;
    await tx
      .insert(insights)
      .values({ accountId: ctx.accountId, type: 'anomaly', code: `ai_${it.type}`, severity: 'info', title: `${titles[it.type]}: ${t.description}`, body: it.explanation, entityType: 'transaction', entityId: it.id, source: 'ai', dedupeKey: `ai:${it.type}:${it.id}` })
      .onConflictDoNothing({ target: [insights.accountId, insights.dedupeKey] });
  }
  return { status: r.status, found: r.proposal.items.length };
}

// ---------------------------------------------------------------------------
// 7. Otimização fiscal: a IA escolhe/explica, o motor calcula o efeito
// ---------------------------------------------------------------------------

export interface Saving {
  action: OptimizationAction;
  title: string;
  rationale: string;
  /** Efeito calculado pelo motor fiscal (null = sem efeito direto quantificável). */
  impactCents: number | null;
  impactKind: 'tax_saving' | 'cash_flow' | 'informational';
  aiGenerated: boolean;
}

const DEFAULT_TEXT: Record<OptimizationAction, { title: string; rationale: string }> = {
  switch_to_organized: { title: 'Avaliar a contabilidade organizada', rationale: 'Com as tuas despesas, o IRS sobre o lucro real pode ser inferior ao do regime simplificado (inclui o custo de um contabilista).' },
  claim_withholding_exemption: { title: 'Pedir a dispensa de retenção na fonte', rationale: 'Os teus rendimentos do ano anterior permitem a dispensa (art. 101.º-B CIRS): recebes o valor total das faturas e acertas no IRS.' },
  adjust_ss_base_down: { title: 'Ajustar a base da Segurança Social', rationale: 'Podes reduzir a base de incidência até 25%. Pagas menos agora, mas a proteção social futura também diminui.' },
  request_missing_receipts: { title: 'Pedir as faturas em falta', rationale: 'Sem fatura com o teu NIF não podes deduzir o IVA dessas despesas.' },
  classify_efatura: { title: 'Classificar as faturas no e-fatura', rationale: 'No regime simplificado, as despesas da atividade classificadas no e-fatura justificam os 15% exigidos.' },
  review_personal_expenses: { title: 'Rever despesas pessoais', rationale: 'Despesas pessoais lançadas na atividade distorcem o resultado e o IVA dedutível.' },
};

export async function computeSavings(tx: TenantTx, ctx: Ctx, deps: { llm: LlmClient | null; loaded: LoadedParams }, year = new Date().getUTCFullYear()): Promise<Saving[]> {
  const [account] = await tx.select().from(accounts).where(eq(accounts.id, ctx.accountId));
  if (!account) return [];
  const params = deps.loaded.resolve(year);
  const yd = await buildYearData(tx, ctx.accountId, year, deps.loaded);
  const individual = account.legalForm === 'trabalhador_independente' || account.legalForm === 'eni';
  const impacts = new Map<OptimizationAction, { cents: number | null; kind: Saving['impactKind'] }>();

  if (individual && account.incomeTaxRegime === 'irs_simplificado' && yd.summary.incomeNetCents > 0) {
    const cmp = compareIrsRegimes(
      { year, activityStartDate: account.activityStartDate, hasEmploymentIncome: account.hasEmploymentIncome, incomes: [{ type: account.mainIncomeType ?? 'servicos_tabela_151', grossCents: yd.summary.incomeNetCents }], socialSecurityPaidCents: yd.summary.socialSecurityPaidCents, justifiedExpenses: { efaturaCents: yd.summary.efaturaExpensesCents } },
      { deductibleExpensesCents: yd.summary.expensesCents + yd.summary.socialSecurityPaidCents, accountantCostCents: 120_000 },
      params,
    );
    if (cmp.savingsWithOrganizedCents > 0) impacts.set('switch_to_organized', { cents: cmp.savingsWithOrganizedCents, kind: 'tax_saving' });
  }
  if (individual && !account.withholdingExempt && yd.summary.withholdingCents > 0) {
    const prev = await buildYearData(tx, ctx.accountId, year - 1, deps.loaded);
    if (prev.summary.incomeNetCents > 0 && prev.summary.incomeNetCents <= params.irs.withholding.exemptionThresholdCents) {
      impacts.set('claim_withholding_exemption', { cents: yd.summary.withholdingCents, kind: 'cash_flow' });
    }
  }
  if (individual && yd.socialSecurity) {
    const quarters = yd.socialSecurity.quarters.map((q) => ({ year: q.year, quarter: q.quarter as 1, byType: { [account.mainIncomeType ?? 'servicos_tabela_151']: q.incomeCents } }));
    const reduced = computeSocialSecurity({ legalForm: account.legalForm, activityStartDate: account.activityStartDate, baseAdjustmentPct: -25, quarters }, deps.loaded.resolve);
    const diff = (yd.socialSecurity.byYear[year] ?? 0) - (reduced.byYear[year] ?? 0);
    if (diff > 0) impacts.set('adjust_ss_base_down', { cents: diff, kind: 'cash_flow' });
  }
  const missingVat = yd.vatOperations
    .filter((o) => o.kind === 'input' && o.hasValidInvoice === false)
    .reduce((s, o) => s + Math.round((o.vatCents * (o.deductiblePct ?? 100)) / 100), 0);
  if (missingVat > 0 && account.vatRegime.startsWith('normal')) impacts.set('request_missing_receipts', { cents: missingVat, kind: 'tax_saving' });
  if (individual && account.incomeTaxRegime === 'irs_simplificado' && yd.irs?.catB.justification) impacts.set('classify_efatura', { cents: yd.irs.catB.justification.additionCents || null, kind: yd.irs.catB.justification.additionCents ? 'tax_saving' : 'informational' });

  const allowed = [...impacts.keys()];
  if (!allowed.length) return [];
  const r = await runFeature(
    optimizationFeature,
    { situation: { estatuto: account.legalForm, regime: account.incomeTaxRegime, iva: account.vatRegime, receitas: yd.summary.incomeNetCents / 100, despesas: yd.summary.expensesCents / 100 }, allowed },
    aiDeps(tx, ctx, deps.llm, { type: 'optimization' }),
  );
  const order = r.proposal?.suggestions.map((s) => s.action) ?? allowed;
  const texts = new Map(r.proposal?.suggestions.map((s) => [s.action, s]) ?? []);
  return order
    .filter((a) => impacts.has(a))
    .map((a) => ({
      action: a,
      title: texts.get(a)?.title ?? DEFAULT_TEXT[a].title,
      rationale: texts.get(a)?.rationale ?? DEFAULT_TEXT[a].rationale,
      impactCents: impacts.get(a)!.cents,
      impactKind: impacts.get(a)!.kind,
      aiGenerated: texts.has(a),
    }));
}

export { OPTIMIZATION_ACTIONS };

// ---------------------------------------------------------------------------
// 8. Lembretes de cobrança com texto personalizado
// ---------------------------------------------------------------------------

export function aiReminderComposer(tx: TenantTx, ctx: Ctx, llm: LlmClient | null): ReminderComposer {
  return async (input) => {
    const amountText = formatEurPlain(input.amountCents);
    const r = await runFeature(
      reminderFeature,
      { stage: input.stage, number: input.number, amountText, dueDateText: input.dueDate.split('-').reverse().join('/'), daysLate: input.daysLate, clientName: input.clientName, accountName: input.accountName, iban: input.iban },
      aiDeps(tx, ctx, llm, { type: 'invoice_reminder' }),
    );
    if (!r.proposal) throw new Error(`IA sem proposta (${r.status})`);
    return { ...r.proposal, aiGenerated: true };
  };
}

/** Utilização da IA no mês face à quota do plano (para a página de definições/planos). */
export async function aiUsageThisMonth(tx: TenantTx, accountId: string) {
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const rows = await tx
    .select({ status: aiLogs.status, decision: aiLogs.decision, n: sql<number>`count(*)::int` })
    .from(aiLogs)
    .where(and(eq(aiLogs.accountId, accountId), gte(aiLogs.createdAt, monthStart)))
    .groupBy(aiLogs.status, aiLogs.decision);
  const [quota] = await tx
    .select({ q: plans.aiMonthlyQuota })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.accountId, accountId));
  const counted = rows.filter((r) => r.status !== 'disabled' && r.status !== 'rate_limited');
  return {
    used: counted.reduce((a, r) => a + r.n, 0),
    quota: quota?.q ?? DEFAULT_MONTHLY_QUOTA,
    accepted: rows.filter((r) => r.decision === 'accepted').reduce((a, r) => a + r.n, 0),
    modified: rows.filter((r) => r.decision === 'modified').reduce((a, r) => a + r.n, 0),
    rejected: rows.filter((r) => r.decision === 'rejected').reduce((a, r) => a + r.n, 0),
  };
}

/** Liga/desliga a IA para a conta (opção RGPD: sem IA nenhum dado é enviado ao fornecedor). */
export async function setAccountAiEnabled(tx: TenantTx, ctx: { accountId: string; userId: string }, enabled: boolean) {
  await tx.update(accounts).set({ aiEnabled: enabled, updatedAt: new Date() }).where(eq(accounts.id, ctx.accountId));
  await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: enabled ? 'ai.enabled' : 'ai.disabled', entityType: 'account', entityId: ctx.accountId });
}

/** Conversas do assistente do utilizador (mais recentes primeiro). */
export async function listAssistantThreads(tx: TenantTx, ctx: { accountId: string; userId: string }) {
  return tx
    .select({ id: chatThreads.id, title: chatThreads.title, updatedAt: chatThreads.updatedAt })
    .from(chatThreads)
    .where(and(eq(chatThreads.accountId, ctx.accountId), eq(chatThreads.userId, ctx.userId), eq(chatThreads.channel, 'assistant')))
    .orderBy(desc(chatThreads.updatedAt))
    .limit(30);
}

export async function getAssistantThread(tx: TenantTx, ctx: { accountId: string; userId: string }, threadId: string) {
  const [t] = await tx
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.accountId, ctx.accountId), eq(chatThreads.userId, ctx.userId)));
  if (!t) return null;
  const messages = await tx
    .select({ id: chatMessages.id, role: chatMessages.role, content: chatMessages.content, createdAt: chatMessages.createdAt })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, t.id))
    .orderBy(chatMessages.createdAt);
  return { thread: t, messages };
}

/** Cliente de IA para a conta: null se a IA estiver desligada globalmente ou pela conta. */
export async function llmForAccount(tx: TenantTx, accountId: string, llm: LlmClient | null): Promise<LlmClient | null> {
  if (!llm) return null;
  const [a] = await tx.select({ on: accounts.aiEnabled }).from(accounts).where(eq(accounts.id, accountId));
  return a?.on ? llm : null;
}
