import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { auditLogs, clients, delegationRequests, memberships, notifications, sessions, transactions, users, withTenant, type DbHandle } from '@somar/db';
import {
  MemoryMailer,
  accountantActivity,
  accountantPortal,
  endDelegation,
  enterClientAccount,
  listMarketplace,
  registerPartner,
  requestDelegation,
  resolveAccountantAccess,
  respondDelegation,
  revokeDelegation,
  setPartnerVerified,
  sha256Hex,
  signUp,
} from '../../src';
import { expectDbError, freshDb, makeUserWithAccount } from './helpers';

let h: DbHandle;
afterAll(async () => h?.close());

async function setup() {
  h = await freshDb();
  const client = await makeUserWithAccount(h, 'Ana');
  const other = await makeUserWithAccount(h, 'Rui');
  const acc = await signUp(h.db, { email: 'cc@gabinete.pt', password: 'palavra-passe-1', name: 'Carla Contas' });
  const partner = await registerPartner(h.db, acc.userId, {
    name: 'Carla Contas',
    firmName: 'Gabinete Contas Certas',
    occNumber: '12345',
    email: 'cc@gabinete.pt',
    city: 'Porto',
    specialties: ['independentes'],
    services: [{ code: 'iva_trimestral', name: 'IVA trimestral', priceFromCents: 4000 }],
  });
  const [admin] = await h.db.insert(users).values({ email: 'admin@somar.pt', name: 'Admin', passwordHash: 'x', isPlatformAdmin: true }).returning();
  return { client, other, acc: { ...acc, sessionId: sha256Hex(acc.token) }, partner, adminId: admin!.id };
}

const ctxOf = (u: { accountId: string; userId: string }) => ({ accountId: u.accountId, userId: u.userId });

async function delegate(s: Awaited<ReturnType<typeof setup>>, scopes: string[]) {
  const mailer = new MemoryMailer();
  const d = await withTenant(h.db, s.client.accountId, (tx) => requestDelegation(tx, { mailer, appUrl: 'https://somar.pt' }, ctxOf(s.client), { partnerId: s.partner.id, scopes, serviceCode: 'iva_trimestral' }));
  await respondDelegation(h.db, s.acc.userId, d.id, true);
  return { d, mailer };
}

describe('contabilistas parceiros e acesso delegado', () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it('só contabilistas verificados aparecem no diretório e podem receber pedidos', async () => {
    expect(await listMarketplace(h.db)).toHaveLength(0);
    await expect(
      withTenant(h.db, s.client.accountId, (tx) => requestDelegation(tx, {}, ctxOf(s.client), { partnerId: s.partner.id, scopes: ['read'] })),
    ).rejects.toThrow(/indisponível/);
    await setPartnerVerified(h.db, s.adminId, s.partner.id, true);
    const list = await listMarketplace(h.db, { city: 'porto', specialty: 'independentes' });
    expect(list.map((p) => p.name)).toEqual(['Carla Contas']);
    expect(list[0]).not.toHaveProperty('email');
    // Mudar o n.º da OCC obriga a nova verificação.
    await registerPartner(h.db, s.acc.userId, { name: 'Carla Contas', occNumber: '99999', email: 'cc@gabinete.pt' });
    expect(await listMarketplace(h.db)).toHaveLength(0);
  });

  it('pedido → aceitação → acesso de consulta imposto pelo Postgres, com registo de acessos', async () => {
    await setPartnerVerified(h.db, s.adminId, s.partner.id, true);
    const { d, mailer } = await delegate(s, ['read']);
    expect(mailer.sent[0]).toMatchObject({ to: 'cc@gabinete.pt' });
    await expect(
      withTenant(h.db, s.client.accountId, (tx) => requestDelegation(tx, {}, ctxOf(s.client), { partnerId: s.partner.id, scopes: ['read'] })),
    ).rejects.toThrow(/em aberto/);

    const [m] = await h.db.select().from(memberships).where(and(eq(memberships.accountId, s.client.accountId), eq(memberships.userId, s.acc.userId)));
    expect(m?.role).toBe('accountant');
    expect((await resolveAccountantAccess(h.db, s.acc.userId, s.client.accountId))?.scopes).toEqual(['read']);

    await enterClientAccount(h.db, { sessionId: s.acc.sessionId, userId: s.acc.userId }, s.client.accountId, { ip: '10.9.9.9' });
    const [sess] = await h.db.select().from(sessions).where(eq(sessions.id, s.acc.sessionId));
    expect(sess?.activeAccountId).toBe(s.client.accountId);

    const ro = { accountId: s.client.accountId, userId: s.acc.userId, readOnly: true };
    await withTenant(h.db, ro, (tx) => tx.select().from(transactions));
    await expectDbError(withTenant(h.db, ro, (tx) => tx.insert(clients).values({ accountId: s.client.accountId, name: 'X' })), /permission denied/);
    await expectDbError(withTenant(h.db, ro, (tx) => tx.update(delegationRequests).set({ scopes: ['read', 'declarations'] })), /permission denied/);

    // Isolamento: sem delegação na outra conta, nada é acessível.
    expect(await resolveAccountantAccess(h.db, s.acc.userId, s.other.accountId)).toBeNull();
    await expect(enterClientAccount(h.db, { sessionId: s.acc.sessionId, userId: s.acc.userId }, s.other.accountId)).rejects.toThrow(/Sem acesso/);
    expect(await withTenant(h.db, { accountId: s.other.accountId, readOnly: true }, (tx) => tx.select().from(delegationRequests))).toHaveLength(0);

    const activity = await withTenant(h.db, s.client.accountId, (tx) => accountantActivity(tx, s.client.accountId));
    expect(activity.map((a) => a.action)).toEqual(['accountant.access', 'delegation.accepted']);
    expect(activity[0]).toMatchObject({ actor: 'Carla Contas', ip: '10.9.9.9' });
    const [n] = await withTenant(h.db, s.client.accountId, (tx) => tx.select().from(notifications).where(eq(notifications.type, 'delegation')));
    expect(n?.title).toMatch(/aceitou/);

    const portal = await accountantPortal(h.db, s.acc.userId);
    expect(portal!.clients.map((c) => c.d.id)).toEqual([d.id]);
    expect(portal!.requests).toHaveLength(0);
  });

  it('o cliente revoga e o acesso termina de imediato; só titulares gerem delegações', async () => {
    await setPartnerVerified(h.db, s.adminId, s.partner.id, true);
    const { d } = await delegate(s, ['read', 'declarations']);
    // O contabilista (membro "accountant") não pode pedir nem revogar delegações.
    const asAccountant = { accountId: s.client.accountId, userId: s.acc.userId };
    await expect(withTenant(h.db, s.client.accountId, (tx) => requestDelegation(tx, {}, asAccountant, { partnerId: s.partner.id, scopes: ['read'] }))).rejects.toThrow(/titular/);
    await expect(revokeDelegation(h.db, asAccountant, d.id)).rejects.toThrow(/titular/);

    await revokeDelegation(h.db, ctxOf(s.client), d.id);
    expect(await resolveAccountantAccess(h.db, s.acc.userId, s.client.accountId)).toBeNull();
    expect(await h.db.select().from(memberships).where(eq(memberships.userId, s.acc.userId))).toHaveLength(0);
    expect((await accountantPortal(h.db, s.acc.userId))!.clients).toHaveLength(0);
    const actions = (await h.db.select().from(auditLogs).where(eq(auditLogs.accountId, s.client.accountId))).map((a) => a.action);
    expect(actions).toContain('delegation.revoked');
  });

  it('a delegação expira automaticamente; o contabilista pode recusar ou terminar', async () => {
    await setPartnerVerified(h.db, s.adminId, s.partner.id, true);
    const { d } = await delegate(s, ['read']);
    expect((await h.db.select().from(delegationRequests).where(eq(delegationRequests.id, d.id)))[0]!.expiresAt!.getUTCFullYear()).toBe(new Date().getUTCFullYear() + 1);
    await h.db.update(delegationRequests).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(delegationRequests.id, d.id));
    expect(await resolveAccountantAccess(h.db, s.acc.userId, s.client.accountId)).toBeNull();
    expect((await h.db.select().from(delegationRequests).where(eq(delegationRequests.id, d.id)))[0]!.status).toBe('completed');
    expect(await h.db.select().from(memberships).where(eq(memberships.userId, s.acc.userId))).toHaveLength(0);

    const r = await withTenant(h.db, s.client.accountId, (tx) => requestDelegation(tx, {}, ctxOf(s.client), { partnerId: s.partner.id, scopes: ['read'] }));
    await respondDelegation(h.db, s.acc.userId, r.id, false);
    await expect(respondDelegation(h.db, s.acc.userId, r.id, true)).rejects.toThrow(/já foi respondido/);
    const again = await withTenant(h.db, s.client.accountId, (tx) => requestDelegation(tx, {}, ctxOf(s.client), { partnerId: s.partner.id, scopes: ['read'] }));
    await respondDelegation(h.db, s.acc.userId, again.id, true);
    await endDelegation(h.db, s.acc.userId, again.id);
    expect(await resolveAccountantAccess(h.db, s.acc.userId, s.client.accountId)).toBeNull();
  });
});
