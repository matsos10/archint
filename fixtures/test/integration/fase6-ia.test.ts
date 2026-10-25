/**
 * Teste de aceitação da Fase 6: no caso de referência, a IA (simulada) assinala o duplicado e uma
 * despesa a verificar, e as oportunidades de poupança têm o efeito calculado pelo motor fiscal
 * (não pela IA): o IVA recuperável da despesa sem justificativo é 8,05 €. Sem IA, as mesmas
 * oportunidades aparecem com texto modelo.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bankAccounts, transactions, withTenant, type DbHandle } from '@somar/db';
import { connectTestDb, truncateAll } from '@somar/db/testing';
import { runSeeders } from '@somar/db/seed';
import { MockLlmClient } from '@somar/ai';
import { computeSavings, createAccount, importTransactions, invalidateTaxParamsCache, loadTaxParams, parseBankCsv, signUp } from '@somar/core';
import { fixture } from '../../eni-simplificado-2025';
import { loadFixtureDocuments } from '../../eni-simplificado-2025/load';

let h: DbHandle;
let ctx: { accountId: string; userId: string };

beforeAll(async () => {
  h = connectTestDb();
  await truncateAll(h);
  await runSeeders(h.db);
  invalidateTaxParamsCache();
  const { userId } = await signUp(h.db, { email: 'marta6@exemplo.pt', password: 'palavra-passe-1', name: 'Marta' });
  const accountId = (await createAccount(h.db, userId, fixture.account as Parameters<typeof createAccount>[2])).id;
  ctx = { accountId, userId };
  await loadFixtureDocuments(h.db, accountId);
  await withTenant(h.db, accountId, async (tx) => {
    const [b] = await tx.insert(bankAccounts).values({ accountId, source: 'csv', name: 'Conta' }).returning();
    await importTransactions(tx, { accountId }, b!.id, parseBankCsv(fixture.bankCsv()).rows);
  });
});
afterAll(async () => h?.close());

describe('Fase 6 — IA no caso de referência', () => {
  it('poupanças: o motor calcula o efeito; a IA só ordena e explica', async () => {
    const loaded = await loadTaxParams(h.db);
    const withoutAi = await withTenant(h.db, ctx.accountId, (tx) => computeSavings(tx, ctx, { llm: null, loaded }, 2025));
    const missing = withoutAi.find((s) => s.action === 'request_missing_receipts')!;
    expect(missing).toMatchObject({ impactCents: 805, impactKind: 'tax_saving', aiGenerated: false });

    const llm = new MockLlmClient({
      optimization: (req) => {
        const allowed: string[] = JSON.parse((req.content[0] as { text: string }).text).acoesPermitidas;
        return JSON.stringify({ suggestions: [...allowed].reverse().map((a) => ({ action: a, title: `Sugestão ${a}`, rationale: 'Porque sim.' })).concat([{ action: 'review_personal_expenses', title: 'Não permitida', rationale: 'x' }]) });
      },
    });
    const withAi = await withTenant(h.db, ctx.accountId, (tx) => computeSavings(tx, ctx, { llm, loaded }, 2025));
    expect(withAi.map((s) => s.action)).toEqual(withoutAi.map((s) => s.action).reverse());
    expect(withAi.every((s) => s.aiGenerated && s.action !== 'review_personal_expenses')).toBe(true);
    expect(withAi.find((s) => s.action === 'request_missing_receipts')!.impactCents).toBe(805);
  });

  it('a IA não altera transações: só cria alertas', async () => {
    const before = await withTenant(h.db, ctx.accountId, (tx) => tx.select().from(transactions));
    const { aiDetectAnomalies } = await import('@somar/core');
    const dup = before.find((t) => t.duplicateOfId)!;
    const llm = new MockLlmClient({ anomalies: () => JSON.stringify({ items: [{ id: dup.id, type: 'duplicate', explanation: 'Mesmo valor e descrição no mesmo dia.' }] }) });
    expect((await withTenant(h.db, ctx.accountId, (tx) => aiDetectAnomalies(tx, ctx, llm, { since: '2025-01-01' }))).found).toBe(1);
    const after = await withTenant(h.db, ctx.accountId, (tx) => tx.select().from(transactions));
    expect(after.map((t) => [t.id, t.categoryId, t.status])).toEqual(before.map((t) => [t.id, t.categoryId, t.status]));
  });
});
