import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  accountantPartners,
  accounts,
  auditLogs,
  declarations,
  delegationRequests,
  memberships,
  notifications,
  taxObligations,
  users,
  withTenant,
  type Db,
  type TenantTx,
} from '@somar/db';
import { audit } from './audit';
import { switchActiveAccount, type RequestMeta } from './auth';
import { AppError } from './errors';
import type { Mailer } from './invoicing/mailer';

/**
 * Contabilistas certificados parceiros e acesso delegado.
 *
 * - O contabilista é um utilizador com perfil de parceiro, verificado pela plataforma (inscrição na OCC).
 * - O cliente (titular/administrador) pede a delegação com âmbitos explícitos; o contabilista aceita.
 * - Aceite a delegação, o contabilista entra na conta como membro "accountant". Sem o âmbito de
 *   escrita correspondente, as transações correm com o papel só de leitura do Postgres.
 * - A delegação expira (12 meses por omissão) e pode ser revogada a qualquer momento pelo cliente.
 * - Cada entrada do contabilista na conta fica no registo de auditoria, visível para o cliente.
 */

export const DELEGATION_SCOPES = {
  read: 'Consultar a contabilidade, faturas, justificativos e declarações',
  accounting: 'Corrigir categorias e confirmar justificativos',
  declarations: 'Preparar e confirmar declarações e registar a submissão',
} as const;
export type DelegationScope = keyof typeof DELEGATION_SCOPES;

export const PARTNER_SPECIALTIES = {
  independentes: 'Trabalhadores independentes',
  eni: 'Empresários em nome individual',
  sociedades: 'Sociedades (Lda., unipessoais)',
  iva: 'IVA e comércio intracomunitário',
  inicio_atividade: 'Início de atividade',
  alojamento_local: 'Alojamento local',
} as const;

export const DELEGATION_MONTHS = 12;

const OPEN = ['requested', 'accepted'] as const;

export const partnerProfileSchema = z.object({
  name: z.string().trim().min(2).max(200),
  firmName: z.string().trim().max(200).optional().transform((v) => v || null),
  occNumber: z
    .string()
    .trim()
    .regex(/^\d{1,7}$/, 'Número de inscrição na OCC inválido (só dígitos).'),
  email: z.email(),
  city: z.string().trim().max(100).optional().transform((v) => v || null),
  bio: z.string().trim().max(1500).optional().transform((v) => v || null),
  specialties: z.array(z.enum(Object.keys(PARTNER_SPECIALTIES) as [keyof typeof PARTNER_SPECIALTIES])).max(6).default([]),
  services: z
    .array(z.object({ code: z.string().regex(/^[a-z0-9_]{2,40}$/), name: z.string().trim().min(2).max(120), priceFromCents: z.number().int().min(0).max(10_000_000) }))
    .max(10)
    .default([]),
});
export type PartnerProfileInput = z.input<typeof partnerProfileSchema>;

export async function getPartnerForUser(db: Db, userId: string) {
  const [p] = await db.select().from(accountantPartners).where(eq(accountantPartners.userId, userId));
  return p ?? null;
}

/** Cria ou atualiza o perfil de parceiro. Mudar o n.º da OCC obriga a nova verificação. */
export async function registerPartner(db: Db, userId: string, input: PartnerProfileInput, meta: RequestMeta = {}) {
  const profile = partnerProfileSchema.parse(input);
  const existing = await getPartnerForUser(db, userId);
  const [row] = existing
    ? await db
        .update(accountantPartners)
        .set({ ...profile, verifiedAt: existing.occNumber === profile.occNumber ? existing.verifiedAt : null, updatedAt: new Date() })
        .where(eq(accountantPartners.id, existing.id))
        .returning()
    : await db.insert(accountantPartners).values({ ...profile, userId }).returning();
  await audit(db, { actorUserId: userId, actorType: 'accountant', action: existing ? 'partner.updated' : 'partner.registered', entityType: 'accountant_partner', entityId: row!.id, ip: meta.ip });
  return row!;
}

/** Verificação manual pela plataforma (confirmação da inscrição na OCC). */
export async function setPartnerVerified(db: Db, adminUserId: string, partnerId: string, verified: boolean) {
  const [row] = await db
    .update(accountantPartners)
    .set({ verifiedAt: verified ? new Date() : null, updatedAt: new Date() })
    .where(eq(accountantPartners.id, partnerId))
    .returning();
  if (!row) throw new AppError('not_found', 'Contabilista não encontrado.', 404);
  await audit(db, { actorUserId: adminUserId, actorType: 'admin', action: verified ? 'partner.verified' : 'partner.unverified', entityType: 'accountant_partner', entityId: partnerId });
  return row;
}

export async function listPartnersForAdmin(db: Db) {
  return db.select().from(accountantPartners).orderBy(accountantPartners.verifiedAt, desc(accountantPartners.createdAt));
}

/** Diretório público de contabilistas verificados (sem dados internos). */
export async function listMarketplace(exec: Db | TenantTx, filters: { city?: string; specialty?: string } = {}) {
  const rows = await exec
    .select({
      id: accountantPartners.id,
      name: accountantPartners.name,
      firmName: accountantPartners.firmName,
      occNumber: accountantPartners.occNumber,
      city: accountantPartners.city,
      bio: accountantPartners.bio,
      specialties: accountantPartners.specialties,
      services: accountantPartners.services,
      rating: accountantPartners.rating,
    })
    .from(accountantPartners)
    .where(and(eq(accountantPartners.active, true), isNotNull(accountantPartners.verifiedAt), isNotNull(accountantPartners.userId)))
    .orderBy(accountantPartners.name);
  const city = filters.city?.trim().toLowerCase();
  return rows.filter((r) => (!city || r.city?.toLowerCase().includes(city)) && (!filters.specialty || r.specialties.includes(filters.specialty)));
}

function normalizeScopes(scopes: string[]): DelegationScope[] {
  const valid = new Set(scopes.filter((s): s is DelegationScope => s in DELEGATION_SCOPES));
  valid.add('read');
  return (Object.keys(DELEGATION_SCOPES) as DelegationScope[]).filter((s) => valid.has(s));
}

async function assertAccountAdmin(tx: TenantTx, ctx: { accountId: string; userId: string }) {
  const [m] = await tx.select({ role: memberships.role }).from(memberships).where(and(eq(memberships.accountId, ctx.accountId), eq(memberships.userId, ctx.userId)));
  if (!m || (m.role !== 'owner' && m.role !== 'admin')) throw new AppError('forbidden', 'Só o titular ou um administrador da conta pode gerir o acesso de contabilistas.', 403);
}

/** O cliente pede a um contabilista verificado que acompanhe a conta, com âmbitos explícitos. */
export async function requestDelegation(
  tx: TenantTx,
  deps: { mailer?: Mailer; appUrl?: string },
  ctx: { accountId: string; userId: string },
  input: { partnerId: string; scopes: string[]; serviceCode?: string | null; message?: string | null },
) {
  await assertAccountAdmin(tx, ctx);
  const [partner] = await tx.select().from(accountantPartners).where(eq(accountantPartners.id, input.partnerId));
  if (!partner || !partner.active || !partner.verifiedAt || !partner.userId) throw new AppError('not_found', 'Contabilista indisponível.', 404);
  if (input.serviceCode && !partner.services.some((s) => s.code === input.serviceCode)) throw new AppError('invalid', 'Serviço inválido.');
  const scopes = normalizeScopes(input.scopes);
  const open = await tx
    .select({ id: delegationRequests.id })
    .from(delegationRequests)
    .where(and(eq(delegationRequests.accountId, ctx.accountId), eq(delegationRequests.partnerId, partner.id), inArray(delegationRequests.status, [...OPEN])));
  if (open.length) throw new AppError('already_open', 'Já existe um pedido em aberto ou um acesso ativo para este contabilista.', 409);
  const [row] = await tx
    .insert(delegationRequests)
    .values({ accountId: ctx.accountId, partnerId: partner.id, requestedBy: ctx.userId, scopes, serviceCode: input.serviceCode ?? null, message: input.message?.trim().slice(0, 1000) || null })
    .returning();
  await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'delegation.requested', entityType: 'delegation', entityId: row!.id, data: { partnerId: partner.id, scopes } });
  const [account] = await tx.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, ctx.accountId));
  await deps.mailer
    ?.send({
      to: partner.email,
      subject: `Novo pedido de acompanhamento: ${account?.name ?? 'cliente'}`,
      text: `Olá ${partner.name},\n\n${account?.name ?? 'Um cliente'} pediu-lhe acompanhamento no Somar.\nPermissões pedidas: ${scopes.map((s) => DELEGATION_SCOPES[s]).join('; ')}.\n\nVeja e responda em ${deps.appUrl ?? ''}/contabilista\n`,
    })
    .catch((e) => console.error('[delegation] email', e));
  return row!;
}

/** Contas ativas, pedidos e resumo de trabalho do contabilista. */
export async function accountantPortal(db: Db, userId: string, today = new Date().toISOString().slice(0, 10)) {
  const partner = await getPartnerForUser(db, userId);
  if (!partner) return null;
  // Os pedidos mostram apenas dados de identificação da conta (minimização antes da aceitação).
  const rows = await db
    .select({ d: delegationRequests, accountName: accounts.name, legalForm: accounts.legalForm, vatRegime: accounts.vatRegime, incomeTaxRegime: accounts.incomeTaxRegime })
    .from(delegationRequests)
    .innerJoin(accounts, eq(accounts.id, delegationRequests.accountId))
    .where(and(eq(delegationRequests.partnerId, partner.id), inArray(delegationRequests.status, [...OPEN])))
    .orderBy(desc(delegationRequests.createdAt));
  const requests = rows.filter((r) => r.d.status === 'requested');
  const clients = [];
  for (const r of rows.filter((x) => x.d.status === 'accepted')) {
    if (r.d.expiresAt && r.d.expiresAt < new Date()) continue;
    // Resumo lido na conta do cliente com o papel só de leitura (RLS).
    const summary = await withTenant(db, { accountId: r.d.accountId, readOnly: true }, async (tx) => {
      const horizon = new Date(Date.parse(today) + 45 * 86_400_000).toISOString().slice(0, 10);
      const next = await tx
        .select({ type: taxObligations.type, dueDate: taxObligations.dueDate, status: taxObligations.status })
        .from(taxObligations)
        .where(and(eq(taxObligations.accountId, r.d.accountId), gte(taxObligations.dueDate, today), lte(taxObligations.dueDate, horizon), inArray(taxObligations.status, ['upcoming', 'in_preparation', 'ready', 'overdue'])))
        .orderBy(taxObligations.dueDate)
        .limit(4);
      const [review] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(declarations)
        .where(and(eq(declarations.accountId, r.d.accountId), eq(declarations.status, 'ready_for_review')));
      return { next, toReview: review?.n ?? 0 };
    });
    clients.push({ ...r, ...summary });
  }
  return { partner, requests, clients };
}

async function partnerDelegation(db: Db, partnerUserId: string, delegationId: string) {
  const partner = await getPartnerForUser(db, partnerUserId);
  if (!partner || !partner.active) throw new AppError('forbidden', 'Sem perfil de contabilista ativo.', 403);
  const [d] = await db.select().from(delegationRequests).where(and(eq(delegationRequests.id, delegationId), eq(delegationRequests.partnerId, partner.id)));
  if (!d) throw new AppError('not_found', 'Pedido não encontrado.', 404);
  return { partner, d };
}

async function notifyAccountAdmins(db: Db, accountId: string, n: { type: string; title: string; body: string; link: string }) {
  const admins = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.accountId, accountId), inArray(memberships.role, ['owner', 'admin'])));
  await withTenant(db, accountId, async (tx) => {
    for (const a of admins) await tx.insert(notifications).values({ accountId, userId: a.userId, ...n });
  });
}

/** O contabilista aceita ou recusa o pedido. Aceitar dá acesso à conta com os âmbitos pedidos. */
export async function respondDelegation(db: Db, partnerUserId: string, delegationId: string, accept: boolean, meta: RequestMeta = {}) {
  const { partner, d } = await partnerDelegation(db, partnerUserId, delegationId);
  if (!partner.verifiedAt) throw new AppError('forbidden', 'O teu perfil ainda aguarda verificação da inscrição na OCC.', 403);
  if (d.status !== 'requested') throw new AppError('invalid_state', 'Este pedido já foi respondido.', 409);
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + DELEGATION_MONTHS);
  await db.transaction(async (tx) => {
    await tx
      .update(delegationRequests)
      .set({ status: accept ? 'accepted' : 'declined', decidedAt: now, acceptedAt: accept ? now : null, expiresAt: accept ? expiresAt : null, updatedAt: now })
      .where(eq(delegationRequests.id, d.id));
    if (accept) await tx.insert(memberships).values({ userId: partnerUserId, accountId: d.accountId, role: 'accountant' }).onConflictDoNothing();
    await audit(tx, { accountId: d.accountId, actorUserId: partnerUserId, actorType: 'accountant', action: accept ? 'delegation.accepted' : 'delegation.declined', entityType: 'delegation', entityId: d.id, ip: meta.ip });
  });
  await notifyAccountAdmins(db, d.accountId, {
    type: 'delegation',
    title: accept ? `${partner.name} aceitou acompanhar a tua conta` : `${partner.name} recusou o pedido`,
    body: accept ? `Acesso ativo até ${expiresAt.toISOString().slice(0, 10)}. Podes revogá-lo a qualquer momento.` : 'Podes escolher outro contabilista certificado.',
    link: '/app/contabilistas',
  });
}

async function dropAccountantMembership(exec: Db, accountId: string, partnerUserId: string | null) {
  if (!partnerUserId) return;
  await exec.delete(memberships).where(and(eq(memberships.accountId, accountId), eq(memberships.userId, partnerUserId), eq(memberships.role, 'accountant')));
}

/** O cliente revoga (ou cancela o pedido). O acesso termina de imediato. */
export async function revokeDelegation(db: Db, ctx: { accountId: string; userId: string }, delegationId: string, meta: RequestMeta = {}, deps: { mailer?: Mailer } = {}) {
  const d = await withTenant(db, ctx, async (tx) => {
    await assertAccountAdmin(tx, ctx);
    const [d] = await tx.select().from(delegationRequests).where(and(eq(delegationRequests.id, delegationId), eq(delegationRequests.accountId, ctx.accountId)));
    if (!d) throw new AppError('not_found', 'Acesso não encontrado.', 404);
    if (!(OPEN as readonly string[]).includes(d.status)) throw new AppError('invalid_state', 'Este acesso já terminou.', 409);
    await tx.update(delegationRequests).set({ status: 'revoked', revokedAt: new Date(), updatedAt: new Date() }).where(eq(delegationRequests.id, d.id));
    await audit(tx, { accountId: ctx.accountId, actorUserId: ctx.userId, action: 'delegation.revoked', entityType: 'delegation', entityId: d.id, ip: meta.ip });
    return d;
  });
  const [partner] = await db.select().from(accountantPartners).where(eq(accountantPartners.id, d.partnerId));
  // A remoção do membro é uma operação de plataforma (o papel de tenant não escreve em memberships).
  await dropAccountantMembership(db, ctx.accountId, partner?.userId ?? null);
  if (partner && d.status === 'accepted') {
    await deps.mailer?.send({ to: partner.email, subject: 'Acesso a conta de cliente revogado', text: `O cliente revogou o seu acesso no Somar. Já não consegue consultar a conta.\n` }).catch(() => undefined);
  }
}

/** O contabilista termina o acompanhamento. */
export async function endDelegation(db: Db, partnerUserId: string, delegationId: string, meta: RequestMeta = {}) {
  const { partner, d } = await partnerDelegation(db, partnerUserId, delegationId);
  if (d.status !== 'accepted') throw new AppError('invalid_state', 'Este acesso não está ativo.', 409);
  await db.update(delegationRequests).set({ status: 'completed', updatedAt: new Date() }).where(eq(delegationRequests.id, d.id));
  await dropAccountantMembership(db, d.accountId, partnerUserId);
  await audit(db, { accountId: d.accountId, actorUserId: partnerUserId, actorType: 'accountant', action: 'delegation.ended', entityType: 'delegation', entityId: d.id, ip: meta.ip });
  await notifyAccountAdmins(db, d.accountId, { type: 'delegation', title: `${partner.name} terminou o acompanhamento`, body: 'O acesso à tua conta terminou.', link: '/app/contabilistas' });
}

export interface AccountantAccess {
  delegationId: string;
  partnerId: string;
  scopes: DelegationScope[];
  expiresAt: Date | null;
}

/**
 * Acesso efetivo de um contabilista a uma conta: delegação aceite, dentro do prazo, e perfil
 * ativo e verificado. Uma delegação expirada é encerrada aqui (e o acesso removido).
 */
export async function resolveAccountantAccess(db: Db, userId: string, accountId: string, now = new Date()): Promise<AccountantAccess | null> {
  const [row] = await db
    .select({ d: delegationRequests, p: accountantPartners })
    .from(delegationRequests)
    .innerJoin(accountantPartners, eq(accountantPartners.id, delegationRequests.partnerId))
    .where(and(eq(delegationRequests.accountId, accountId), eq(accountantPartners.userId, userId), eq(delegationRequests.status, 'accepted')));
  if (!row || !row.p.active || !row.p.verifiedAt) return null;
  if (row.d.expiresAt && row.d.expiresAt <= now) {
    await db.update(delegationRequests).set({ status: 'completed', updatedAt: now }).where(eq(delegationRequests.id, row.d.id));
    await dropAccountantMembership(db, accountId, userId);
    await audit(db, { accountId, actorType: 'system', action: 'delegation.expired', entityType: 'delegation', entityId: row.d.id });
    return null;
  }
  return { delegationId: row.d.id, partnerId: row.p.id, scopes: normalizeScopes(row.d.scopes), expiresAt: row.d.expiresAt };
}

/** O contabilista abre a conta de um cliente: verifica a delegação e regista o acesso. */
export async function enterClientAccount(db: Db, s: { sessionId: string; userId: string }, accountId: string, meta: RequestMeta = {}) {
  const access = await resolveAccountantAccess(db, s.userId, accountId);
  if (!access) throw new AppError('forbidden', 'Sem acesso ativo a esta conta.', 403);
  await switchActiveAccount(db, s.sessionId, s.userId, accountId);
  await audit(db, { accountId, actorUserId: s.userId, actorType: 'accountant', action: 'accountant.access', entityType: 'delegation', entityId: access.delegationId, data: { scopes: access.scopes }, ip: meta.ip });
  return access;
}

/** Delegações da conta (para o cliente). */
export async function listAccountDelegations(tx: TenantTx, accountId: string) {
  return tx
    .select({ d: delegationRequests, partnerName: accountantPartners.name, firmName: accountantPartners.firmName, occNumber: accountantPartners.occNumber, services: accountantPartners.services })
    .from(delegationRequests)
    .innerJoin(accountantPartners, eq(accountantPartners.id, delegationRequests.partnerId))
    .where(eq(delegationRequests.accountId, accountId))
    .orderBy(desc(delegationRequests.createdAt))
    .limit(30);
}

/** Registo de acessos e ações de contabilistas na conta (transparência para o cliente). */
export async function accountantActivity(tx: TenantTx, accountId: string, limit = 50) {
  return tx
    .select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, createdAt: auditLogs.createdAt, ip: auditLogs.ip, actor: users.name })
    .from(auditLogs)
    .innerJoin(accountantPartners, eq(accountantPartners.userId, auditLogs.actorUserId))
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(eq(auditLogs.accountId, accountId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}
