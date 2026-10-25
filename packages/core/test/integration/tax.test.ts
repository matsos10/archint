import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { taxObligations, users, withTenant, type DbHandle } from '@somar/db';
import params2025 from '@somar/tax-engine/params/2025.json';
import {
  createTaxParamDraft,
  effectiveObligationStatus,
  listObligations,
  loadTaxParams,
  publishTaxParamSet,
  syncObligations,
  updateAccountProfile,
} from '../../src';
import { freshDb, makeUserWithAccount } from './helpers';

let h: DbHandle;
beforeEach(async () => {
  h?.close();
  h = await freshDb();
});
afterAll(async () => h?.close());

describe('parâmetros fiscais versionados', () => {
  it('carrega a versão publicada e cria/publica novas versões validadas', async () => {
    const before = await loadTaxParams(h.db, { fresh: true });
    expect(before.resolve(2025).irs.withholding.rates.servicos_tabela_151).toBe(0.23);
    const [admin] = await h.db.insert(users).values({ email: 'admin@somar.pt', name: 'Admin', passwordHash: 'x', isPlatformAdmin: true }).returning();

    await expect(createTaxParamDraft(h.db, admin!.id, { params: { ...params2025, irs: { ...params2025.irs, brackets: [] } } })).rejects.toThrow(/inválidos/);

    const edited = structuredClone(params2025);
    edited.irs.withholding.rates.servicos_tabela_151 = 0.22;
    const draft = await createTaxParamDraft(h.db, admin!.id, { params: edited, notes: 'teste' });
    expect(draft.version).toBe(2);
    expect(draft.status).toBe('draft');
    // O rascunho não afeta os cálculos
    expect((await loadTaxParams(h.db, { fresh: true })).resolve(2025).irs.withholding.rates.servicos_tabela_151).toBe(0.23);

    await publishTaxParamSet(h.db, admin!.id, draft.id);
    const after = await loadTaxParams(h.db);
    expect(after.resolve(2025).irs.withholding.rates.servicos_tabela_151).toBe(0.22);
    expect(after.setIdFor(2025)).toBe(draft.id);
    await expect(publishTaxParamSet(h.db, admin!.id, draft.id)).rejects.toThrow(/rascunhos/);
  });
});

describe('obrigações fiscais da conta', () => {
  it('são geradas no onboarding, de forma idempotente, e acompanham mudanças de regime', async () => {
    const a = await makeUserWithAccount(h, 'Ana');
    const range = { from: '2025-01-01', to: '2025-12-31' };
    await syncObligations(h.db, a.accountId, range, undefined, { includePast: true });
    const first = await withTenant(h.db, a.accountId, (tx) => listObligations(tx, a.accountId, range));
    expect(first.filter((o) => o.type === 'iva_declaracao_periodica')).toHaveLength(4);
    expect(first.find((o) => o.type === 'irs_modelo3')?.dueDate).toBe('2025-06-30');

    const again = await syncObligations(h.db, a.accountId, range, undefined, { includePast: true });
    expect(again.removed).toBe(0);
    const second = await withTenant(h.db, a.accountId, (tx) => listObligations(tx, a.accountId, range));
    expect(second.map((o) => o.id)).toEqual(first.map((o) => o.id));

    // Marca uma como submetida e muda para o regime de isenção do art. 53.º
    const submitted = first.find((o) => o.type === 'iva_declaracao_periodica')!;
    await withTenant(h.db, a.accountId, (tx) => tx.update(taxObligations).set({ status: 'submitted' }).where(eq(taxObligations.id, submitted.id)));
    await updateAccountProfile(h.db, { accountId: a.accountId, userId: a.userId }, {
      name: 'Ana Design', legalForm: 'trabalhador_independente', nif: '123456789', vatRegime: 'isento_art53',
      incomeTaxRegime: 'irs_simplificado', activityStartDate: '2023-03-01', mainIncomeType: 'servicos_tabela_151',
    });
    await syncObligations(h.db, a.accountId, range, undefined, { includePast: true });
    const third = await withTenant(h.db, a.accountId, (tx) => listObligations(tx, a.accountId, range));
    const vat = third.filter((o) => o.type.startsWith('iva'));
    expect(vat.map((o) => o.id)).toEqual([submitted.id]); // a cumprida mantém-se como histórico
  });

  it('cada conta só vê as suas obrigações', async () => {
    const a = await makeUserWithAccount(h, 'Ana');
    const b = await makeUserWithAccount(h, 'Bruno');
    const range = { from: '2025-01-01', to: '2025-12-31' };
    await syncObligations(h.db, a.accountId, range, undefined, { includePast: true });
    await syncObligations(h.db, b.accountId, range, undefined, { includePast: true });
    const seen = await withTenant(h.db, a.accountId, (tx) => tx.select().from(taxObligations));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((o) => o.accountId === a.accountId)).toBe(true);
  });

  it('não gera prazos anteriores à adesão (evita falsos atrasos numa conta nova)', async () => {
    const a = await makeUserWithAccount(h, 'Ana');
    const today = new Date().toISOString().slice(0, 10);
    const y = Number(today.slice(0, 4));
    await syncObligations(h.db, a.accountId, { from: `${y}-01-01`, to: `${y + 1}-12-31` });
    const rows = await withTenant(h.db, a.accountId, (tx) => tx.select().from(taxObligations));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((o) => o.dueDate >= today)).toBe(true);
  });

  it('marca como em atraso as obrigações por cumprir com prazo ultrapassado', () => {
    expect(effectiveObligationStatus({ status: 'upcoming', dueDate: '2025-05-20' }, '2025-05-21')).toBe('overdue');
    expect(effectiveObligationStatus({ status: 'submitted', dueDate: '2025-05-20' }, '2025-05-21')).toBe('submitted');
  });
});
