/**
 * Teste de aceitação da Fase 3: o caso de referência entra pelo extrato CSV do banco e é processado
 * de ponta a ponta — deduplicação, categorização por regras, associação de faturas e justificativos,
 * alertas (duplicado e justificativo em falta) e cálculo de IVA, IRS e Segurança Social.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNotNull } from 'drizzle-orm';
import { bankAccounts, categories, insights, invoices, receipts, transactions, withTenant, type DbHandle } from '@somar/db';
import { connectTestDb, truncateAll } from '@somar/db/testing';
import { runSeeders } from '@somar/db/seed';
import { buildYearData, createAccount, importTransactions, invalidateTaxParamsCache, loadTaxParams, parseBankCsv, signUp } from '@somar/core';
import { fixture } from '../../eni-simplificado-2025';
import { loadFixtureDocuments } from '../../eni-simplificado-2025/load';

let h: DbHandle;
let accountId: string;
let bankId: string;
const c = (eur: number) => Math.round(eur * 100);

beforeAll(async () => {
  h = connectTestDb();
  await truncateAll(h);
  await runSeeders(h.db);
  invalidateTaxParamsCache();
  const { userId } = await signUp(h.db, { email: 'marta@exemplo.pt', password: 'palavra-passe-1', name: 'Marta Ferreira' });
  const account = await createAccount(h.db, userId, fixture.account as Parameters<typeof createAccount>[2]);
  accountId = account.id;
  await loadFixtureDocuments(h.db, accountId);
  bankId = await withTenant(h.db, accountId, async (tx) => {
    const [b] = await tx.insert(bankAccounts).values({ accountId, source: 'csv', name: 'Conta à ordem' }).returning();
    return b!.id;
  });
});
afterAll(async () => h?.close());

/** Faz corresponder os movimentos da base de dados aos ids da fixture (ordem do extrato). */
async function txByFixtureId() {
  const rows = await withTenant(h.db, accountId, (tx) => tx.select().from(transactions).orderBy(transactions.bookingDate, transactions.createdAt));
  const pool = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.bookingDate}|${r.amountCents}|${r.description}`;
    pool.set(k, [...(pool.get(k) ?? []), r]);
  }
  const map = new Map<string, (typeof rows)[number]>();
  for (const t of fixture.truth) {
    const k = `${t.date}|${t.amountCents}|${t.description}`;
    const list = pool.get(k)!;
    map.set(t.id, t.duplicate ? list.find((r) => r.duplicateOfId)! : list.find((r) => !r.duplicateOfId) ?? list[0]!);
  }
  return map;
}

describe('Fase 3 — caso de referência a partir do extrato bancário', () => {
  it('lê o CSV do banco (formato português) sem perder movimentos', () => {
    const parsed = parseBankCsv(fixture.bankCsv());
    expect(parsed.warnings).toEqual([]);
    expect(parsed.rows).toHaveLength(93);
    expect(parsed.rows.at(-1)!.balanceCents).toBe(c(8847.08));
    expect(parsed.rows.reduce((s, r) => s + r.amountCents, 0)).toBe(c(8847.08 - 8000));
  });

  it('importa, deteta o duplicado e é idempotente', async () => {
    const rows = parseBankCsv(fixture.bankCsv()).rows;
    const r1 = await withTenant(h.db, accountId, (tx) => importTransactions(tx, { accountId }, bankId, rows, { source: 'csv' }));
    expect(r1).toMatchObject({ imported: 93, skipped: 0, duplicates: 1, invoicesMatched: 7, receiptsMatched: 43 });
    const r2 = await withTenant(h.db, accountId, (tx) => importTransactions(tx, { accountId }, bankId, rows, { source: 'csv' }));
    expect(r2).toMatchObject({ imported: 0, skipped: 93, duplicates: 0 });
    const dups = await withTenant(h.db, accountId, (tx) => tx.select().from(transactions).where(isNotNull(transactions.duplicateOfId)));
    expect(dups.map((d) => [d.bookingDate, d.description])).toEqual([['2025-04-08', 'DD MEO FATURA']]);
  });

  it('categoriza 100% dos movimentos como esperado, só com regras', async () => {
    const map = await txByFixtureId();
    const cats = await withTenant(h.db, accountId, (tx) => tx.select({ id: categories.id, code: categories.code }).from(categories));
    const code = new Map(cats.map((x) => [x.id, x.code]));
    const wrong = fixture.truth
      .map((t) => ({ id: t.id, desc: t.description, expected: t.category, got: code.get(map.get(t.id)!.categoryId ?? '') }))
      .filter((x) => x.expected !== x.got);
    expect(wrong).toEqual([]);
  });

  it('associa cada justificativo ao movimento certo e cada recebimento à sua fatura', async () => {
    const map = await txByFixtureId();
    const rs = await withTenant(h.db, accountId, (tx) => tx.select().from(receipts));
    const mismatched = rs.filter((r) => r.transactionId !== map.get((r.extracted as { fixtureTransactionId: string }).fixtureTransactionId)!.id);
    expect(mismatched).toHaveLength(0);
    const invs = await withTenant(h.db, accountId, (tx) => tx.select().from(invoices).orderBy(invoices.sequence));
    expect(invs.map((i) => i.status)).toEqual(['paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'issued']);
    for (const t of fixture.truth.filter((x) => x.invoice)) {
      expect(invs.find((i) => i.id === map.get(t.id)!.invoiceId)?.number).toBe(t.invoice);
    }
  });

  it('gera alertas: duplicado e justificativo em falta (cabos), sem recebimentos sem fatura', async () => {
    const open = await withTenant(h.db, accountId, (tx) => tx.select().from(insights).where(and(eq(insights.accountId, accountId), eq(insights.status, 'open'))));
    const byCode = (code: string) => open.filter((i) => i.code === code);
    expect(byCode('duplicate_transaction')).toHaveLength(1);
    expect(byCode('missing_receipt').map((i) => i.title)).toEqual(['Falta o justificativo: COMPRA LOJA INFORMATICA CABOS']);
    expect(byCode('missing_invoice')).toHaveLength(0);
    expect(byCode('uncategorized')).toHaveLength(0);
  });

  it('calcula IVA, IRS e Segurança Social de 2025 iguais aos cálculos à mão', async () => {
    const loaded = await loadTaxParams(h.db);
    const d = await withTenant(h.db, accountId, (tx) =>
      buildYearData(tx, accountId, 2025, loaded, {
        previousYearQuarterIncomeCents: { 3: fixture.previousYear.socialSecurity.incomeByQuarter2024['3'], 4: fixture.previousYear.socialSecurity.incomeByQuarter2024['4'] },
        deductions: fixture.previousYear.personalDeductions2025,
      }),
    );
    expect(d.incomeSource).toBe('invoices');
    expect(d.vat.map((q) => q.output.totalVatCents)).toEqual([c(1104), c(2415), c(1656), c(2277)]);
    expect(d.vat.map((q) => q.input.deductibleCents)).toEqual([c(529), c(171.35), c(165.6), c(280.6)]);
    expect(d.vat.map((q) => q.payableCents)).toEqual([c(575), c(2243.65), c(1490.4), c(1996.4)]);
    expect(d.summary.efaturaExpensesCents).toBe(c(5049.65));
    expect(d.summary.socialSecurityPaidCents).toBe(c(4479.02));
    expect(d.summary.withholdingCents).toBe(c(7176));
    expect(d.irs!.collectableCents).toBe(c(24_300));
    expect(d.irs!.netTaxCents).toBe(c(4368.16));
    expect(d.irs!.resultCents).toBe(c(-2807.84));
    expect(d.socialSecurity!.paidByYear[2025]).toBe(c(4479.02));
    expect(d.summary.socialSecurityCents).toBe(c(4538.94));
    expect(d.summary.incomeNetCents).toBe(c(32_400));
    expect(d.months).toHaveLength(12);
  });
});
