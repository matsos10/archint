/**
 * Teste de aceitação da Fase 5: a partir da contabilidade do caso de referência, a app prepara as
 * declarações de IVA (4 trimestres), a declaração trimestral da SS e o IRS (Anexos B e SS), com os
 * valores calculados à mão; o utilizador confirma e regista a submissão; os prazos geram notificações.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { bankAccounts, declarations, notifications, taxObligations, withTenant, type DbHandle } from '@somar/db';
import { connectTestDb, truncateAll } from '@somar/db/testing';
import { runSeeders } from '@somar/db/seed';
import {
  MemoryMailer,
  confirmDeclaration,
  createAccount,
  importTransactions,
  invalidateTaxParamsCache,
  loadTaxParams,
  markDeclarationSubmitted,
  notifyObligations,
  parseBankCsv,
  prepareDeclaration,
  signUp,
  syncObligations,
  type DeclarationData,
} from '@somar/core';
import { fixture } from '../../eni-simplificado-2025';
import { loadFixtureDocuments } from '../../eni-simplificado-2025/load';

let h: DbHandle;
let accountId: string;
let userId: string;
const c = (eur: number) => Math.round(eur * 100);

beforeAll(async () => {
  h = connectTestDb();
  await truncateAll(h);
  await runSeeders(h.db);
  invalidateTaxParamsCache();
  ({ userId } = await signUp(h.db, { email: 'marta5@exemplo.pt', password: 'palavra-passe-1', name: 'Marta Ferreira' }));
  accountId = (await createAccount(h.db, userId, fixture.account as Parameters<typeof createAccount>[2])).id;
  await loadFixtureDocuments(h.db, accountId);
  await withTenant(h.db, accountId, async (tx) => {
    const [b] = await tx.insert(bankAccounts).values({ accountId, source: 'csv', name: 'Conta à ordem' }).returning();
    await importTransactions(tx, { accountId }, b!.id, parseBankCsv(fixture.bankCsv()).rows);
  });
  await syncObligations(h.db, accountId, { from: '2025-01-01', to: '2026-12-31' }, undefined, { includePast: true });
});
afterAll(async () => h?.close());

async function obligation(type: string, periodStart: string) {
  return withTenant(h.db, accountId, async (tx) => (await tx.select().from(taxObligations).where(and(eq(taxObligations.type, type as 'irs_modelo3'), eq(taxObligations.periodStart, periodStart))))[0]!);
}

async function prepare(type: string, periodStart: string) {
  const loaded = await loadTaxParams(h.db);
  const o = await obligation(type, periodStart);
  const r = await withTenant(h.db, accountId, (tx) => prepareDeclaration(tx, { accountId, userId }, o.id, loaded));
  const [d] = await withTenant(h.db, accountId, (tx) => tx.select().from(declarations).where(eq(declarations.id, r.declarationId!)));
  return { obligation: o, declaration: d!, data: d!.data as unknown as DeclarationData };
}

const field = (data: DeclarationData, code: string) => data.sections.flatMap((s) => s.fields).find((f) => f.code === code)?.valueCents;

describe('Fase 5 — declarações do caso de referência', () => {
  it('IVA: campos do Quadro 06 dos 4 trimestres', async () => {
    const expected = [
      ['2025-01-01', 1104, 529, 575, 345],
      ['2025-04-01', 2415, 171.35, 2243.65, 0],
      ['2025-07-01', 1656, 165.6, 1490.4, 0],
      ['2025-10-01', 2277, 280.6, 1996.4, 0],
    ] as const;
    for (const [start, out, ded, pay, imob] of expected) {
      const { data, declaration } = await prepare('iva_declaracao_periodica', start);
      expect(field(data, '4')).toBe(c(out));
      expect((field(data, '20') ?? 0) + (field(data, '24') ?? 0)).toBe(c(ded));
      expect(field(data, '20')).toBe(c(imob));
      expect(field(data, '93')).toBe(c(pay));
      expect(declaration.status).toBe('ready_for_review');
      expect(declaration.paramSetId).not.toBeNull();
      expect(data.files.map((f) => f.mimeType)).toEqual(['text/csv', 'application/json']);
    }
    const pay = await obligation('iva_pagamento', '2025-01-01');
    const loaded = await loadTaxParams(h.db);
    const r = await withTenant(h.db, accountId, (tx) => prepareDeclaration(tx, { accountId, userId }, pay.id, loaded));
    expect(r).toEqual({ declarationId: null, amountCents: c(575) });
  });

  it('Segurança Social: declaração do 1.º trimestre (4 800 € → 239,68 €/mês)', async () => {
    const { data } = await prepare('ss_declaracao_trimestral', '2025-01-01');
    expect(field(data, 'Serviços')).toBe(c(4800));
    expect(field(data, 'C')).toBe(c(239.68));
  });

  it('IRS 2025: Anexo B (rendimentos e retenções por NIF) e Anexo SS', async () => {
    const { data } = await prepare('irs_modelo3', '2025-01-01');
    expect(field(data, '403')).toBe(c(32_400));
    const q6 = data.sections.find((s) => s.title.includes('Quadro 6'))!.fields;
    const retained = q6.filter((f) => f.label.endsWith('retenção')).map((f) => [f.code, f.valueCents]);
    expect(retained).toEqual([
      ['NIF 509123457', c(3450)],
      ['NIF 507345673', c(2760)],
      ['NIF 510234569', c(966)],
    ]);
    const ss = data.sections.find((s) => s.title.startsWith('Anexo SS'))!.fields;
    expect(ss.map((f) => f.valueCents)).toEqual([c(15_000), c(12_000), c(4200), c(1200)]);
    // Sem deduções pessoais (vêm do e-fatura/Anexo H): 4 618,16 − 7 176,00 = −2 557,84
    expect(data.summary.at(-1)).toEqual({ label: 'Estimativa de reembolso', valueCents: c(2557.84), emphasis: true });
  });

  it('o utilizador confirma e regista a submissão (a app nunca submete)', async () => {
    const { declaration, obligation: o } = await prepare('ss_declaracao_trimestral', '2025-04-01');
    const ctx = { accountId, userId };
    await expect(withTenant(h.db, accountId, (tx) => markDeclarationSubmitted(tx, ctx, declaration.id))).rejects.toThrow(/Confirma/);
    await withTenant(h.db, accountId, (tx) => confirmDeclaration(tx, ctx, declaration.id));
    await withTenant(h.db, accountId, (tx) => markDeclarationSubmitted(tx, ctx, declaration.id, 'SSD-123'));
    const [after] = await withTenant(h.db, accountId, (tx) => tx.select().from(taxObligations).where(eq(taxObligations.id, o.id)));
    expect(after!.status).toBe('submitted');
    // Uma declaração submetida não é recalculada
    const again = await prepare('ss_declaracao_trimestral', '2025-04-01');
    expect(again.declaration.status).toBe('submitted');
  });

  it('notifica 10 dias antes (com valores preparados), no dia e em atraso, sem repetir', async () => {
    const mailer = new MemoryMailer();
    const loaded = await loadTaxParams(h.db);
    const n1 = await withTenant(h.db, accountId, (tx) => notifyObligations(tx, { mailer, loaded }, accountId, '2025-11-10'));
    expect(n1).toBeGreaterThan(0);
    const n2 = await withTenant(h.db, accountId, (tx) => notifyObligations(tx, { mailer, loaded }, accountId, '2025-11-10'));
    expect(n2).toBe(0);
    const list = await withTenant(h.db, accountId, (tx) => tx.select().from(notifications));
    const vat = list.find((n) => n.title.startsWith('Declaração periódica de IVA (3.º trimestre 2025)'))!;
    expect(vat.title).toContain('daqui a 10 dias');
    expect(vat.body).toContain('1490,40');
    expect(mailer.sent.some((m) => m.to === 'marta5@exemplo.pt' && m.subject.includes('IVA'))).toBe(true);
    await withTenant(h.db, accountId, (tx) => notifyObligations(tx, { mailer, loaded }, accountId, '2025-11-21'));
    const overdue = (await withTenant(h.db, accountId, (tx) => tx.select().from(notifications))).filter((n) => n.type === 'obligation_overdue');
    expect(overdue.map((n) => n.title)).toContain('Declaração periódica de IVA (3.º trimestre 2025) terminou ontem');
  });
});
