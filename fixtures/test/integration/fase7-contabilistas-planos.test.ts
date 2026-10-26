/**
 * Teste de aceitação da Fase 7 com o caso de referência:
 *  - a Marta (ENI) escolhe uma contabilista certificada verificada e delega consulta + declarações;
 *  - a contabilista consulta a contabilidade em modo só de leitura (imposto pelo Postgres) e vê os
 *    mesmos valores calculados à mão; só com o âmbito "declarações" consegue preparar a declaração;
 *  - a preparação de declarações é dos planos pagos: um webhook assinado do Stripe ativa o Plus;
 *  - a Marta vê o registo de acessos e revoga o acesso, que termina de imediato.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { bankAccounts, declarations, plans, subscriptions, taxObligations, users, withTenant, type DbHandle } from '@somar/db';
import { connectTestDb, truncateAll } from '@somar/db/testing';
import { runSeeders } from '@somar/db/seed';
import {
  accountantActivity,
  assertFeature,
  buildYearData,
  createAccount,
  effectivePlan,
  enterClientAccount,
  handleStripeEvent,
  importTransactions,
  invalidateTaxParamsCache,
  listMarketplace,
  loadTaxParams,
  parseBankCsv,
  prepareDeclaration,
  registerPartner,
  requestDelegation,
  resolveAccountantAccess,
  respondDelegation,
  revokeDelegation,
  setPartnerVerified,
  sha256Hex,
  signStripePayload,
  signUp,
  syncObligations,
  verifyStripeSignature,
  type DeclarationData,
} from '@somar/core';
import { fixture } from '../../eni-simplificado-2025';
import { loadFixtureDocuments } from '../../eni-simplificado-2025/load';

let h: DbHandle;
let accountId: string;
let martaId: string;
let carla: { userId: string; sessionId: string };
let partnerId: string;
const c = (eur: number) => Math.round(eur * 100);

beforeAll(async () => {
  h = connectTestDb();
  await truncateAll(h);
  await runSeeders(h.db);
  invalidateTaxParamsCache();
  ({ userId: martaId } = await signUp(h.db, { email: 'marta7@exemplo.pt', password: 'palavra-passe-1', name: 'Marta Ferreira' }));
  accountId = (await createAccount(h.db, martaId, fixture.account as Parameters<typeof createAccount>[2])).id;
  await loadFixtureDocuments(h.db, accountId);
  await withTenant(h.db, accountId, async (tx) => {
    const [b] = await tx.insert(bankAccounts).values({ accountId, source: 'csv', name: 'Conta à ordem' }).returning();
    await importTransactions(tx, { accountId }, b!.id, parseBankCsv(fixture.bankCsv()).rows);
  });
  await syncObligations(h.db, accountId, { from: '2025-01-01', to: '2026-12-31' }, undefined, { includePast: true });

  const s = await signUp(h.db, { email: 'carla@contascertas.pt', password: 'palavra-passe-1', name: 'Carla Sousa' });
  carla = { userId: s.userId, sessionId: sha256Hex(s.token) };
  partnerId = (await registerPartner(h.db, s.userId, { name: 'Carla Sousa', firmName: 'Contas Certas', occNumber: '45678', email: 'carla@contascertas.pt', city: 'Braga', specialties: ['eni', 'iva'], services: [{ code: 'iva_irs', name: 'IVA trimestral e IRS', priceFromCents: 6000 }] })).id;
  const [admin] = await h.db.insert(users).values({ email: 'admin@somar.pt', name: 'Admin', passwordHash: 'x', isPlatformAdmin: true }).returning();
  await setPartnerVerified(h.db, admin!.id, partnerId, true);
  await h.db.update(plans).set({ stripePriceMonthlyId: 'price_plus_m' }).where(eq(plans.code, 'plus'));
});
afterAll(async () => h?.close());

async function q1Obligation() {
  return withTenant(h.db, accountId, async (tx) => (await tx.select().from(taxObligations).where(and(eq(taxObligations.type, 'iva_declaracao_periodica'), eq(taxObligations.periodStart, '2025-01-01'))))[0]!);
}

describe('Fase 7 — contabilista certificada e planos no caso de referência', () => {
  it('a Marta encontra a contabilista verificada e delega consulta e declarações', async () => {
    const found = await listMarketplace(h.db, { specialty: 'eni', city: 'braga' });
    expect(found.map((p) => p.id)).toEqual([partnerId]);
    const d = await withTenant(h.db, accountId, (tx) => requestDelegation(tx, {}, { accountId, userId: martaId }, { partnerId, scopes: ['declarations'], serviceCode: 'iva_irs' }));
    expect(d.scopes).toEqual(['read', 'declarations']);
    await respondDelegation(h.db, carla.userId, d.id, true);
    await enterClientAccount(h.db, carla, accountId);
    expect((await resolveAccountantAccess(h.db, carla.userId, accountId))?.scopes).toEqual(['read', 'declarations']);
  });

  it('em consulta, a contabilista vê os valores calculados à mão mas não consegue escrever', async () => {
    const loaded = await loadTaxParams(h.db);
    const ro = { accountId, userId: carla.userId, readOnly: true };
    const d = await withTenant(h.db, ro, (tx) => buildYearData(tx, accountId, 2025, loaded));
    expect(d.vat.map((q) => q.payableCents)).toEqual([c(575), c(2243.65), c(1490.4), c(1996.4)]);
    expect(d.summary.incomeNetCents).toBe(c(32_400));
    expect(d.summary.socialSecurityPaidCents).toBe(c(4479.02));
    const o = await q1Obligation();
    await expect(withTenant(h.db, ro, (tx) => prepareDeclaration(tx, { accountId, userId: carla.userId }, o.id, loaded))).rejects.toThrow();
    expect(await withTenant(h.db, accountId, (tx) => tx.select().from(declarations))).toHaveLength(0);
  });

  it('a preparação exige plano pago; o webhook assinado ativa o Plus e a contabilista prepara o IVA do 1.º trimestre', async () => {
    await expect(assertFeature(h.db, accountId, 'declaracoes')).rejects.toThrow(/planos pagos/);
    await h.db.update(subscriptions).set({ stripeCustomerId: 'cus_marta' }).where(eq(subscriptions.accountId, accountId));
    const body = JSON.stringify({
      id: 'evt_plus',
      type: 'customer.subscription.created',
      data: { object: { id: 'sub_marta', customer: 'cus_marta', status: 'active', items: { data: [{ price: { id: 'price_plus_m', recurring: { interval: 'month' } }, current_period_end: 1_800_000_000 }] } } },
    });
    await handleStripeEvent(h.db, null, verifyStripeSignature(body, signStripePayload(body, 'whsec_fase7'), 'whsec_fase7'));
    expect(await effectivePlan(h.db, accountId)).toMatchObject({ code: 'plus', paid: true, aiMonthlyQuota: 300 });
    await assertFeature(h.db, accountId, 'declaracoes');

    const loaded = await loadTaxParams(h.db);
    const o = await q1Obligation();
    const r = await withTenant(h.db, { accountId, userId: carla.userId }, (tx) => prepareDeclaration(tx, { accountId, userId: carla.userId }, o.id, loaded));
    const [decl] = await withTenant(h.db, accountId, (tx) => tx.select().from(declarations).where(eq(declarations.id, r.declarationId!)));
    const data = decl!.data as unknown as DeclarationData;
    const field = (code: string) => data.sections.flatMap((s) => s.fields).find((f) => f.code === code)?.valueCents;
    expect(field('93')).toBe(c(575));
    expect(decl!.status).toBe('ready_for_review'); // a Marta revê e confirma; nada é submetido automaticamente
  });

  it('a Marta vê o registo de acessos e revoga o acesso, que termina de imediato', async () => {
    const activity = await withTenant(h.db, accountId, (tx) => accountantActivity(tx, accountId));
    expect(activity.map((a) => a.action)).toEqual(['declaration.prepared', 'accountant.access', 'delegation.accepted']);
    expect(new Set(activity.map((a) => a.actor))).toEqual(new Set(['Carla Sousa']));
    const [d] = await withTenant(h.db, accountId, (tx) => tx.query.delegationRequests.findMany());
    await revokeDelegation(h.db, { accountId, userId: martaId }, d!.id);
    expect(await resolveAccountantAccess(h.db, carla.userId, accountId)).toBeNull();
    await expect(enterClientAccount(h.db, carla, accountId)).rejects.toThrow(/Sem acesso/);
  });
});
