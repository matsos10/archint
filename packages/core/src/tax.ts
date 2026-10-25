import { and, desc, eq, gte, inArray, lte, notInArray, sql } from 'drizzle-orm';
import {
  accounts,
  taxObligations,
  taxParameterSets,
  withTenant,
  type Db,
  type TenantTx,
} from '@somar/db';
import {
  buildObligationCalendar,
  createParamsResolver,
  parseTaxParams,
  safeParseTaxParams,
  type CalendarProfile,
  type ParamsResolver,
  type TaxParams,
} from '@somar/tax-engine';
import { audit } from './audit';
import { AppError } from './errors';

// ---------------------------------------------------------------------------
// Parâmetros fiscais (tabela versionada por ano)
// ---------------------------------------------------------------------------

export interface LoadedParams {
  resolve: ParamsResolver;
  /** id do conjunto de parâmetros usado para cada ano (guardado nas declarações). */
  setIdFor: (year: number) => string | undefined;
  years: number[];
}

let cache: { at: number; value: LoadedParams } | undefined;
const CACHE_MS = 5 * 60 * 1000;

/** Carrega a versão publicada mais recente de cada ano. Cache de 5 minutos (invalidada ao publicar). */
export async function loadTaxParams(db: Db, opts: { fresh?: boolean } = {}): Promise<LoadedParams> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const rows = await db
    .select()
    .from(taxParameterSets)
    .where(eq(taxParameterSets.status, 'published'))
    .orderBy(taxParameterSets.year, desc(taxParameterSets.version));
  const latest = new Map<number, (typeof rows)[number]>();
  for (const r of rows) if (!latest.has(r.year)) latest.set(r.year, r);
  if (latest.size === 0) throw new AppError('no_tax_params', 'Parâmetros fiscais não configurados.', 500);
  const parsed: TaxParams[] = [];
  const ids = new Map<number, string>();
  for (const [year, r] of latest) {
    parsed.push(parseTaxParams(r.params));
    ids.set(year, r.id);
  }
  const value: LoadedParams = { resolve: createParamsResolver(parsed), setIdFor: (y) => ids.get(y), years: [...latest.keys()] };
  cache = { at: Date.now(), value };
  return value;
}

export function invalidateTaxParamsCache() {
  cache = undefined;
}

export async function listTaxParamSets(db: Db) {
  return db
    .select({
      id: taxParameterSets.id,
      year: taxParameterSets.year,
      version: taxParameterSets.version,
      status: taxParameterSets.status,
      notes: taxParameterSets.notes,
      publishedAt: taxParameterSets.publishedAt,
      createdAt: taxParameterSets.createdAt,
    })
    .from(taxParameterSets)
    .orderBy(desc(taxParameterSets.year), desc(taxParameterSets.version));
}

export async function getTaxParamSet(db: Db, id: string) {
  const [row] = await db.select().from(taxParameterSets).where(eq(taxParameterSets.id, id));
  return row ?? null;
}

/** Cria uma nova versão (rascunho) depois de validar os parâmetros com o schema do motor fiscal. */
export async function createTaxParamDraft(db: Db, userId: string, input: { params: unknown; notes?: string }) {
  const parsed = safeParseTaxParams(input.params);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new AppError('invalid_params', `Parâmetros inválidos — ${issues.join('; ')}`);
  }
  const year = parsed.data.year;
  return db.transaction(async (tx) => {
    const [{ max } = { max: 0 }] = await tx
      .select({ max: sql<number>`coalesce(max(${taxParameterSets.version}), 0)` })
      .from(taxParameterSets)
      .where(eq(taxParameterSets.year, year));
    const [row] = await tx
      .insert(taxParameterSets)
      .values({ year, version: Number(max) + 1, status: 'draft', params: parsed.data as unknown as Record<string, unknown>, notes: input.notes, createdBy: userId })
      .returning();
    await audit(tx, { actorUserId: userId, actorType: 'admin', action: 'tax_params.draft_created', entityType: 'tax_parameter_set', entityId: row!.id, data: { year, version: row!.version } });
    return row!;
  });
}

/** Publica uma versão: passa a ser a usada nos cálculos desse ano; a anterior fica arquivada. */
export async function publishTaxParamSet(db: Db, userId: string, id: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(taxParameterSets).where(eq(taxParameterSets.id, id));
    if (!row) throw new AppError('not_found', 'Versão não encontrada.', 404);
    if (row.status !== 'draft') throw new AppError('invalid_state', 'Só é possível publicar rascunhos.');
    parseTaxParams(row.params);
    await tx
      .update(taxParameterSets)
      .set({ status: 'archived' })
      .where(and(eq(taxParameterSets.year, row.year), eq(taxParameterSets.status, 'published')));
    await tx.update(taxParameterSets).set({ status: 'published', publishedAt: new Date() }).where(eq(taxParameterSets.id, id));
    await audit(tx, { actorUserId: userId, actorType: 'admin', action: 'tax_params.published', entityType: 'tax_parameter_set', entityId: id, data: { year: row.year, version: row.version } });
  });
  invalidateTaxParamsCache();
}

// ---------------------------------------------------------------------------
// Obrigações fiscais da conta
// ---------------------------------------------------------------------------

type AccountRow = typeof accounts.$inferSelect;

export function calendarProfileFor(account: AccountRow, extra: Partial<CalendarProfile> = {}): CalendarProfile {
  return {
    legalForm: account.legalForm,
    vatRegime: account.vatRegime,
    incomeTaxRegime: account.incomeTaxRegime,
    activityStartDate: account.activityStartDate,
    invoicesAutoCommunicated: true,
    ...extra,
  };
}

export function defaultObligationRange(today = new Date()) {
  const y = today.getUTCFullYear();
  return { from: `${y}-01-01`, to: `${y + 1}-12-31` };
}

/**
 * Gera/atualiza as obrigações da conta a partir do calendário do motor fiscal.
 * Idempotente: atualiza prazos das obrigações por cumprir e remove as que deixaram de se aplicar
 * (ex.: mudança para o regime de isenção), sem tocar nas já cumpridas.
 */
export async function syncObligations(
  db: Db,
  accountId: string,
  range = defaultObligationRange(),
  params?: LoadedParams,
  opts: { includePast?: boolean } = {},
) {
  const loaded = params ?? (await loadTaxParams(db));
  return withTenant(db, accountId, async (tx) => {
    const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId));
    if (!account) throw new AppError('not_found', 'Conta não encontrada.', 404);
    // Prazos anteriores à adesão à app não são acompanhados (o utilizador cumpriu-os por outra via);
    // caso contrário, uma conta nova veria meses de obrigações "em atraso".
    const since = opts.includePast ? range.from : (account.onboardingCompletedAt ?? account.createdAt).toISOString().slice(0, 10);
    const calendar = buildObligationCalendar(calendarProfileFor(account), range, loaded.resolve).filter((o) => o.dueDate >= since);
    const keep: string[] = [];
    for (const o of calendar) {
      const [row] = await tx
        .insert(taxObligations)
        .values({
          accountId,
          type: o.type,
          periodStart: o.periodStart,
          periodEnd: o.periodEnd,
          periodLabel: o.periodLabel,
          windowStart: o.windowStart,
          dueDate: o.dueDate,
          legalRef: o.legalRef,
          status: o.automatic ? 'not_applicable' : 'upcoming',
        })
        .onConflictDoUpdate({
          target: [taxObligations.accountId, taxObligations.type, taxObligations.periodStart, taxObligations.periodEnd],
          set: { dueDate: o.dueDate, windowStart: o.windowStart, periodLabel: o.periodLabel, legalRef: o.legalRef, updatedAt: new Date() },
        })
        .returning({ id: taxObligations.id });
      keep.push(row!.id);
    }
    // Remove obrigações por cumprir, no intervalo, que já não constam do calendário.
    const removable = and(
      eq(taxObligations.accountId, accountId),
      gte(taxObligations.dueDate, range.from),
      lte(taxObligations.dueDate, range.to),
      inArray(taxObligations.status, ['upcoming', 'overdue', 'not_applicable']),
      keep.length ? notInArray(taxObligations.id, keep) : undefined,
    );
    const removed = await tx.delete(taxObligations).where(removable).returning({ id: taxObligations.id });
    return { upserted: keep.length, removed: removed.length };
  });
}

export async function listObligations(tx: TenantTx, accountId: string, range: { from: string; to: string }) {
  return tx
    .select()
    .from(taxObligations)
    .where(and(eq(taxObligations.accountId, accountId), gte(taxObligations.dueDate, range.from), lte(taxObligations.dueDate, range.to)))
    .orderBy(taxObligations.dueDate, taxObligations.type);
}

/** Estado efetivo: uma obrigação por cumprir com prazo ultrapassado está em atraso. */
export function effectiveObligationStatus(o: { status: string; dueDate: string }, today: string) {
  if ((o.status === 'upcoming' || o.status === 'in_preparation' || o.status === 'ready') && o.dueDate < today) return 'overdue';
  return o.status;
}

export const OBLIGATION_LABELS: Record<string, string> = {
  iva_declaracao_periodica: 'Declaração periódica de IVA',
  iva_pagamento: 'Pagamento de IVA',
  irs_modelo3: 'Declaração de IRS (Modelo 3)',
  irs_pagamento_por_conta: 'Pagamento por conta de IRS',
  ss_declaracao_trimestral: 'Declaração trimestral à Segurança Social',
  ss_pagamento_contribuicoes: 'Contribuições à Segurança Social',
  efatura_comunicacao: 'Comunicação de faturas à AT',
  saft_faturacao: 'SAF-T de faturação',
  irc_modelo22: 'Declaração de IRC (Modelo 22)',
  irc_pagamento_por_conta: 'Pagamento por conta de IRC',
  ies: 'IES / Declaração Anual',
  dmr_retencoes: 'Declaração Mensal de Remunerações',
  ss_declaracao_remuneracoes: 'Declaração de remunerações à Segurança Social',
  modelo10: 'Modelo 10',
};
