import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { aiLogs, bankAccounts, chatMessages, files, insights, plans, receipts, transactions, withTenant, type DbHandle } from '@somar/db';
import { LlmError, MockLlmClient } from '@somar/ai';
import {
  aiUsageThisMonth,
  llmForAccount,
  setAccountAiEnabled,
  ASSISTANT_UNAVAILABLE,
  LocalEncryptedStorage,
  aiCategorizePending,
  aiDetectAnomalies,
  aiExtractReceipt,
  aiReminderComposer,
  askAssistant,
  buildYearData,
  confirmAiCategory,
  confirmReceipt,
  importTransactions,
  loadTaxParams,
  parseKeyring,
  refreshInsights,
} from '../../src';
import { freshDb, makeUserWithAccount } from './helpers';

let h: DbHandle;
beforeEach(async () => {
  h?.close();
  h = await freshDb();
});
afterAll(async () => h?.close());

async function setup() {
  const a = await makeUserWithAccount(h, 'Ana');
  const ctx = { accountId: a.accountId, userId: a.userId };
  const bank = await withTenant(h.db, a.accountId, async (tx) => (await tx.insert(bankAccounts).values({ accountId: a.accountId, source: 'manual', name: 'B' }).returning())[0]!.id);
  return { a, ctx, bank };
}

describe('IA integrada (respostas simuladas)', () => {
  it('categoriza o que as regras não resolveram, como sugestão a confirmar, e regista a decisão', async () => {
    const { ctx, bank } = await setup();
    const llm = new MockLlmClient({
      categorize: (req) => {
        const data = JSON.parse((req.content[0] as { text: string }).text);
        return JSON.stringify({ items: data.movimentos.map((m: { id: string }) => ({ id: m.id, categoryCode: 'formacao', confidence: 0.8, reason: 'Livraria técnica' })) });
      },
    });
    await withTenant(h.db, ctx.accountId, async (tx) => {
      await importTransactions(tx, ctx, bank, [{ bookingDate: '2025-03-01', description: 'COMPRA LIVRARIA BERTRAND', amountCents: -2500 }]);
      const r = await aiCategorizePending(tx, ctx, llm);
      expect(r).toEqual({ status: 'ok', applied: 1 });
      const [t] = await tx.select().from(transactions);
      expect(t).toMatchObject({ categorySource: 'ai', status: 'to_review', categoryConfidence: 0.8 });
      const [log] = await tx.select().from(aiLogs);
      expect(log).toMatchObject({ feature: 'categorize', status: 'ok', decision: 'pending', userId: ctx.userId });
      await confirmAiCategory(tx, ctx, t!.id);
      expect((await tx.select().from(aiLogs))[0]!.decision).toBe('accepted');
      expect((await tx.select().from(transactions))[0]).toMatchObject({ categorySource: 'user', status: 'categorized' });
    });
  });

  it('respeita a quota mensal do plano e funciona sem IA', async () => {
    const { ctx, bank } = await setup();
    await h.db.update(plans).set({ aiMonthlyQuota: 1 });
    const llm = new MockLlmClient({ categorize: () => JSON.stringify({ items: [] }) });
    await withTenant(h.db, ctx.accountId, async (tx) => {
      await importTransactions(tx, ctx, bank, [{ bookingDate: '2025-03-01', description: 'X Y Z', amountCents: -100 }]);
      expect((await aiCategorizePending(tx, ctx, llm)).status).toBe('invalid_output'); // lista vazia = sem proposta
      expect((await aiCategorizePending(tx, ctx, llm)).status).toBe('rate_limited');
      expect((await aiCategorizePending(tx, ctx, null)).status).toBe('disabled');
      expect((await aiCategorizePending(tx, ctx, new MockLlmClient({ categorize: () => new LlmError('unavailable', 'x') }))).applied).toBe(0);
      expect((await tx.select().from(transactions))[0]!.categoryId).toBeNull();
    });
  });

  it('desligar a IA na conta impede qualquer envio e a utilização conta face à quota', async () => {
    const { ctx, bank } = await setup();
    const llm = new MockLlmClient({ categorize: () => JSON.stringify({ items: [] }) });
    await withTenant(h.db, ctx.accountId, async (tx) => {
      await importTransactions(tx, ctx, bank, [{ bookingDate: '2025-03-01', description: 'X Y Z', amountCents: -100 }]);
      await aiCategorizePending(tx, ctx, await llmForAccount(tx, ctx.accountId, llm));
      expect(await aiUsageThisMonth(tx, ctx.accountId)).toMatchObject({ used: 1, quota: 30 });
      await setAccountAiEnabled(tx, ctx, false);
      expect(await llmForAccount(tx, ctx.accountId, llm)).toBeNull();
      expect((await aiCategorizePending(tx, ctx, await llmForAccount(tx, ctx.accountId, llm))).status).toBe('disabled');
      expect(llm.calls).toHaveLength(1);
      expect(await aiUsageThisMonth(tx, ctx.accountId)).toMatchObject({ used: 1 });
    });
  });

  it('OCR: os valores lidos pela IA só contam para os impostos depois de confirmados', async () => {
    const { ctx, bank, a } = await setup();
    const storage = new LocalEncryptedStorage(mkdtempSync(path.join(os.tmpdir(), 'somar-ai-')), parseKeyring('1=' + Buffer.alloc(32, 4).toString('base64')));
    const llm = new MockLlmClient({
      receipt_ocr: () => JSON.stringify({ isInvoice: true, supplierName: 'Galp Energia', supplierNif: '506012344', buyerNif: '123456789', documentNumber: 'FS 1', atcud: 'A-1', documentDate: '2025-05-14', totalEuros: 61.5, vatEuros: 11.5, vatRateCode: 'normal', confidence: 0.9 }),
    });
    const loaded = await loadTaxParams(h.db);
    await withTenant(h.db, ctx.accountId, async (tx) => {
      await importTransactions(tx, ctx, bank, [{ bookingDate: '2025-05-14', description: 'COMPRA GALP COMBUSTIVEL', amountCents: -6150 }]);
      await storage.put(`${a.accountId}/receipts/x.jpg`, Buffer.from('jpeg'));
      const [f] = await tx.insert(files).values({ accountId: a.accountId, kind: 'receipt', storageKey: `${a.accountId}/receipts/x.jpg`, mimeType: 'image/jpeg', sizeBytes: 4, sha256: 'x'.repeat(64) }).returning();
      const [r] = await tx.insert(receipts).values({ accountId: a.accountId, fileId: f!.id }).returning();
      expect(await aiExtractReceipt(tx, { llm, storage, params: loaded.resolve(2025) }, ctx, r!.id)).toEqual({ status: 'ok', updated: true });
      const [after] = await tx.select().from(receipts);
      expect(after).toMatchObject({ status: 'matched', totalCents: 6150, vatCents: 1150 });
      const before = await buildYearData(tx, ctx.accountId, 2025, loaded);
      expect(before.vat[1]!.input.deductibleCents).toBe(0);
      expect(before.warnings.some((w) => w.includes('aguardam a tua confirmação'))).toBe(true);
      await confirmReceipt(tx, { accountId: ctx.accountId, userId: ctx.userId }, r!.id, { totalCents: 6150, vatCents: 1150, documentDate: '2025-05-14' });
      const confirmed = await buildYearData(tx, ctx.accountId, 2025, loaded);
      expect(confirmed.vat[1]!.input.deductibleCents).toBe(575); // gasóleo: 50% de 11,50 €
    });
  });

  it('assistente: guarda a conversa, avisa sobre valores não verificados e degrada sem IA', async () => {
    const { ctx } = await setup();
    const loaded = await loadTaxParams(h.db);
    const llm = new MockLlmClient({ assistant: () => JSON.stringify({ answer: 'Vais pagar 1234,00 € de IVA.', followUps: [], needsAccountant: false }) });
    await withTenant(h.db, ctx.accountId, async (tx) => {
      const r = await askAssistant(tx, { llm, loaded }, ctx, { question: 'Quanto IVA vou pagar?' });
      expect(r.answer).toContain('Valores não verificados');
      expect(r.answer).toContain('não substitui um contabilista');
      const off = await askAssistant(tx, { llm: null, loaded }, ctx, { threadId: r.threadId, question: 'E o IRS?' });
      expect(off.answer).toBe(ASSISTANT_UNAVAILABLE);
      expect(await tx.select().from(chatMessages)).toHaveLength(4);
    });
  });

  it('anomalias da IA ficam como alertas e não são apagadas pelas regras', async () => {
    const { ctx, bank } = await setup();
    await withTenant(h.db, ctx.accountId, async (tx) => {
      await importTransactions(tx, ctx, bank, [{ bookingDate: new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10), description: 'COMPRA CONTINENTE', amountCents: -32050 }]);
      const [t] = await tx.select().from(transactions);
      const llm = new MockLlmClient({ anomalies: () => JSON.stringify({ items: [{ id: t!.id, type: 'personal_expense', explanation: 'Supermercado: parece pessoal.' }, { id: 'inexistente', type: 'other', explanation: 'x' }] }) });
      expect((await aiDetectAnomalies(tx, ctx, llm)).found).toBe(1);
      await refreshInsights(tx, ctx.accountId);
      const ai = (await tx.select().from(insights)).filter((i) => i.source === 'ai');
      expect(ai.map((i) => [i.code, i.status])).toEqual([['ai_personal_expense', 'open']]);
    });
  });

  it('lembrete personalizado pela IA, com recurso ao modelo se a proposta falhar', async () => {
    const { ctx } = await setup();
    const input = { stage: 1, number: 'FT 2025A/8', amountCents: 240000, dueDate: '2026-01-18', daysLate: 3, clientName: 'Padaria', accountName: 'Ana' };
    await withTenant(h.db, ctx.accountId, async (tx) => {
      const ok = aiReminderComposer(tx, ctx, new MockLlmClient({ reminder: () => JSON.stringify({ subject: 'Fatura FT 2025A/8', body: 'Olá, a fatura FT 2025A/8 de 2400,00 € venceu a 18/01/2026.' }) }));
      expect((await ok(input)).aiGenerated).toBe(true);
      const bad = aiReminderComposer(tx, ctx, new MockLlmClient({ reminder: () => JSON.stringify({ subject: 'x', body: 'pague já' }) }));
      await expect(bad(input)).rejects.toThrow(/sem proposta/);
      expect((await tx.select().from(aiLogs)).map((l) => l.status).sort()).toEqual(['invalid_output', 'ok']);
    });
  });
});
