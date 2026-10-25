import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { categories, categorizationRules, transactions, type TenantTx } from '@somar/db';
import systemRulesData from '@somar/db/seed-data/categorization-rules.json';
import { merchantKey, normalizeDescription } from './banking/normalize';

/**
 * Categorização por regras (primeiro as do utilizador, depois as de sistema). A IA (Fase 6) só é
 * chamada para o que as regras não resolvem, e a sua proposta passa sempre pela confirmação do utilizador.
 */

export interface RuleLike {
  id?: string;
  matchField: 'description' | 'counterparty';
  matchType: 'contains' | 'regex' | 'starts_with';
  pattern: string;
  direction: 'in' | 'out' | 'any';
  categoryId: string;
  priority: number;
  source: 'user' | 'system';
  /** Confiança da regra (por omissão 0,95 utilizador / 0,8 sistema). Abaixo de 0,7 fica para revisão. */
  confidence?: number;
}

export interface CategorizableTx {
  description: string;
  counterparty?: string | null;
  amountCents: number;
}

export interface CategoryDecision {
  categoryId: string;
  source: 'rule' | 'user';
  confidence: number;
  ruleId?: string;
}

const regexCache = new Map<string, RegExp | null>();
function compiled(pattern: string): RegExp | null {
  if (!regexCache.has(pattern)) {
    try {
      regexCache.set(pattern, new RegExp(pattern));
    } catch {
      regexCache.set(pattern, null);
    }
  }
  return regexCache.get(pattern)!;
}

export function ruleMatches(rule: RuleLike, tx: CategorizableTx): boolean {
  if (rule.direction === 'in' && tx.amountCents <= 0) return false;
  if (rule.direction === 'out' && tx.amountCents >= 0) return false;
  const text = normalizeDescription(rule.matchField === 'counterparty' ? (tx.counterparty ?? '') : `${tx.description} ${tx.counterparty ?? ''}`);
  const pattern = rule.matchType === 'regex' ? rule.pattern : normalizeDescription(rule.pattern);
  if (!pattern) return false;
  if (rule.matchType === 'regex') return compiled(pattern)?.test(text) ?? false;
  if (rule.matchType === 'starts_with') return text.startsWith(pattern);
  return ` ${text} `.includes(` ${pattern} `);
}

/** Decide a categoria de um movimento; regras do utilizador têm precedência sobre as de sistema. */
export function categorize(tx: CategorizableTx, rules: RuleLike[]): CategoryDecision | null {
  const ordered = [...rules].sort((a, b) => (a.source === b.source ? a.priority - b.priority : a.source === 'user' ? -1 : 1));
  for (const r of ordered) {
    if (ruleMatches(r, tx)) return { categoryId: r.categoryId, source: 'rule', confidence: r.confidence ?? (r.source === 'user' ? 0.95 : 0.8), ruleId: r.id };
  }
  return null;
}

/** Carrega as regras aplicáveis à conta (as de sistema resolvidas para os ids das categorias). */
export async function loadRules(tx: TenantTx, accountId: string): Promise<RuleLike[]> {
  const cats = await tx
    .select({ id: categories.id, code: categories.code, accountId: categories.accountId })
    .from(categories)
    .where(or(isNull(categories.accountId), eq(categories.accountId, accountId)));
  const byCode = new Map<string, string>();
  for (const c of cats) if (c.accountId === null || !byCode.has(c.code)) byCode.set(c.code, c.id);
  const system: RuleLike[] = systemRulesData
    .filter((r) => byCode.has(r.category))
    .map((r) => ({
      matchField: 'description',
      matchType: 'regex',
      pattern: r.pattern,
      direction: r.direction as RuleLike['direction'],
      categoryId: byCode.get(r.category)!,
      priority: r.priority,
      source: 'system',
      confidence: (r as { confidence?: number }).confidence,
    }));
  const user = await tx.select().from(categorizationRules).where(eq(categorizationRules.accountId, accountId));
  return [
    ...user.map((r) => ({
      id: r.id,
      matchField: r.matchField as RuleLike['matchField'],
      matchType: r.matchType as RuleLike['matchType'],
      pattern: r.pattern,
      direction: r.direction as RuleLike['direction'],
      categoryId: r.categoryId,
      priority: r.priority,
      source: 'user' as const,
    })),
    ...system,
  ];
}

/**
 * Aplica as regras aos movimentos ainda não categorizados (ou categorizados por regra/IA, nunca
 * sobrepondo uma escolha do utilizador). Devolve o número de movimentos categorizados.
 */
export async function applyRules(tx: TenantTx, accountId: string, opts: { transactionIds?: string[] } = {}): Promise<number> {
  const rules = await loadRules(tx, accountId);
  const where = and(
    eq(transactions.accountId, accountId),
    or(isNull(transactions.categorySource), inArray(transactions.categorySource, ['rule', 'import', 'ai'])),
    opts.transactionIds?.length ? inArray(transactions.id, opts.transactionIds) : undefined,
  );
  const rows = await tx.select().from(transactions).where(where);
  let n = 0;
  const hits = new Map<string, number>();
  for (const t of rows) {
    const d = categorize(t, rules);
    if (!d) continue;
    if (t.categoryId === d.categoryId && t.categorySource === 'rule') continue;
    await tx
      .update(transactions)
      .set({
        categoryId: d.categoryId,
        categorySource: 'rule',
        categoryConfidence: d.confidence,
        status: d.confidence >= 0.7 && t.status === 'to_review' && !t.duplicateOfId ? 'categorized' : t.status,
      })
      .where(eq(transactions.id, t.id));
    if (d.ruleId) hits.set(d.ruleId, (hits.get(d.ruleId) ?? 0) + 1);
    n++;
  }
  for (const [id, k] of hits) {
    await tx.update(categorizationRules).set({ hits: sql`${categorizationRules.hits} + ${k}` }).where(eq(categorizationRules.id, id));
  }
  return n;
}

/**
 * Correção do utilizador: grava a categoria escolhida e aprende uma regra a partir da chave do
 * comerciante, aplicando-a aos movimentos semelhantes que não foram escolhidos manualmente.
 */
export async function correctCategory(
  tx: TenantTx,
  accountId: string,
  transactionId: string,
  categoryId: string,
  opts: { learn?: boolean } = {},
): Promise<{ learnedPattern: string | null; propagated: number }> {
  const [t] = await tx.select().from(transactions).where(and(eq(transactions.id, transactionId), eq(transactions.accountId, accountId)));
  if (!t) throw new Error('Movimento não encontrado');
  await tx
    .update(transactions)
    .set({ categoryId, categorySource: 'user', categoryConfidence: 1, status: t.duplicateOfId ? t.status : 'categorized' })
    .where(eq(transactions.id, transactionId));
  if (opts.learn === false) return { learnedPattern: null, propagated: 0 };
  const key = merchantKey(t.description);
  if (key.length < 3) return { learnedPattern: null, propagated: 0 };
  const direction = t.amountCents >= 0 ? 'in' : 'out';
  const [existing] = await tx
    .select()
    .from(categorizationRules)
    .where(and(eq(categorizationRules.accountId, accountId), eq(categorizationRules.pattern, key), eq(categorizationRules.direction, direction)));
  if (existing) {
    await tx.update(categorizationRules).set({ categoryId }).where(eq(categorizationRules.id, existing.id));
  } else {
    await tx.insert(categorizationRules).values({ accountId, pattern: key, matchType: 'contains', direction, categoryId, priority: 50, createdFrom: 'user_correction' });
  }
  const propagated = await applyRules(tx, accountId);
  return { learnedPattern: key, propagated };
}
