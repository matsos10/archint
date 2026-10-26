import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { accounts, memberships, plans, sessions, subscriptions, withTenant, type Db, type TenantTx } from '@somar/db';
import { audit } from './audit';
import { AppError } from './errors';
import { isCompanyNif, isIndividualNif } from './nif';
import { syncObligations } from './tax';

export const LEGAL_FORMS = ['trabalhador_independente', 'eni', 'unipessoal_lda', 'lda'] as const;
export const VAT_REGIMES = ['normal_mensal', 'normal_trimestral', 'isento_art53', 'isento_art9'] as const;
export const INCOME_TAX_REGIMES = ['irs_simplificado', 'irs_contabilidade_organizada', 'irc_geral'] as const;
export const IRS_INCOME_TYPES = [
  'servicos_tabela_151',
  'servicos_outros',
  'vendas',
  'hotelaria_restauracao',
  'propriedade_intelectual',
  'subsidios_exploracao',
  'subsidios_outros',
] as const;

export const isIndividual = (legalForm: (typeof LEGAL_FORMS)[number]) =>
  legalForm === 'trabalhador_independente' || legalForm === 'eni';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const accountProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Indica o nome da atividade ou empresa.').max(200),
    legalForm: z.enum(LEGAL_FORMS),
    nif: optionalText(9),
    vatRegime: z.enum(VAT_REGIMES),
    incomeTaxRegime: z.enum(INCOME_TAX_REGIMES),
    taxRegion: z.enum(['continente', 'madeira', 'acores']).default('continente'),
    activityStartDate: z.iso.date('Data de início inválida.'),
    cae: optionalText(5).refine((v) => !v || /^\d{5}$/.test(v), 'O CAE tem 5 dígitos.'),
    cirsActivityCode: optionalText(4).refine((v) => !v || /^\d{4}$/.test(v), 'O código do art. 151.º tem 4 dígitos.'),
    mainIncomeType: z.enum(IRS_INCOME_TYPES).optional(),
    hasEmploymentIncome: z.boolean().default(false),
    addressLine: optionalText(300),
    postalCode: optionalText(8).refine((v) => !v || /^\d{4}-\d{3}$/.test(v), 'Código postal no formato 0000-000.'),
    city: optionalText(100),
    email: z.email('Email inválido.').optional().or(z.literal('').transform(() => undefined)),
  })
  .superRefine((v, ctx) => {
    const individual = isIndividual(v.legalForm);
    if (individual && v.incomeTaxRegime === 'irc_geral') {
      ctx.addIssue({ code: 'custom', path: ['incomeTaxRegime'], message: 'Um trabalhador independente ou ENI é tributado em IRS.' });
    }
    if (!individual && v.incomeTaxRegime !== 'irc_geral') {
      ctx.addIssue({ code: 'custom', path: ['incomeTaxRegime'], message: 'Uma sociedade é tributada em IRC.' });
    }
    if (!individual && v.vatRegime === 'isento_art53') {
      // Art. 53.º CIVA aplica-se a sujeitos passivos sem contabilidade organizada; as sociedades têm-na sempre.
      ctx.addIssue({ code: 'custom', path: ['vatRegime'], message: 'O regime de isenção do art. 53.º não se aplica a sociedades.' });
    }
    if (individual && !v.mainIncomeType) {
      ctx.addIssue({ code: 'custom', path: ['mainIncomeType'], message: 'Indica o tipo principal de rendimento.' });
    }
    if (v.nif) {
      const ok = individual ? isIndividualNif(v.nif) : isCompanyNif(v.nif);
      if (!ok) ctx.addIssue({ code: 'custom', path: ['nif'], message: individual ? 'NIF de pessoa singular inválido.' : 'NIPC inválido.' });
    }
    const start = new Date(v.activityStartDate);
    if (start.getTime() > Date.now() + 366 * 24 * 3600 * 1000) {
      ctx.addIssue({ code: 'custom', path: ['activityStartDate'], message: 'Data de início demasiado distante.' });
    }
  });

export type AccountProfileInput = z.input<typeof accountProfileSchema>;
export type AccountProfile = z.output<typeof accountProfileSchema>;

/**
 * Cria a conta (tenant) no fim do onboarding, com o utilizador como titular e o plano gratuito.
 * Corre com o papel de plataforma (criar contas não é uma operação de tenant).
 */
export async function createAccount(db: Db, userId: string, input: AccountProfileInput, opts: { sessionId?: string; ip?: string | null } = {}) {
  const profile = accountProfileSchema.parse(input);
  const account = await db.transaction(async (tx) => {
    const [account] = await tx
      .insert(accounts)
      .values({ ...profile, onboardingCompletedAt: new Date() })
      .returning();
    await tx.insert(memberships).values({ userId, accountId: account!.id, role: 'owner' });
    const [free] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.code, 'gratuito'));
    if (free) await tx.insert(subscriptions).values({ accountId: account!.id, planId: free.id, status: 'active' });
    if (opts.sessionId) await tx.update(sessions).set({ activeAccountId: account!.id }).where(eq(sessions.id, opts.sessionId));
    await audit(tx, {
      accountId: account!.id,
      actorUserId: userId,
      action: 'account.created',
      entityType: 'account',
      entityId: account!.id,
      data: { legalForm: profile.legalForm, vatRegime: profile.vatRegime, incomeTaxRegime: profile.incomeTaxRegime },
      ip: opts.ip,
    });
    return account!;
  });
  await syncObligationsSafely(db, account.id);
  return account;
}

/** Gera o calendário fiscal; uma falha (ex.: parâmetros em falta) não impede a operação principal. */
async function syncObligationsSafely(db: Db, accountId: string) {
  try {
    await syncObligations(db, accountId);
  } catch (e) {
    console.error('[obligations] falha ao sincronizar', accountId, e);
  }
}

export async function getAccount(tx: TenantTx, accountId: string) {
  const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId));
  return account ?? null;
}

export async function updateAccountProfile(db: Db, ctx: { accountId: string; userId: string }, input: AccountProfileInput) {
  const profile = accountProfileSchema.parse(input);
  return withTenant(db, ctx, async (tx) => {
    const [before] = await tx.select().from(accounts).where(eq(accounts.id, ctx.accountId));
    if (!before) throw new AppError('not_found', 'Conta não encontrada.', 404);
    const [after] = await tx.update(accounts).set(profile).where(eq(accounts.id, ctx.accountId)).returning();
    const changed = Object.fromEntries(
      Object.entries(profile).filter(([k, v]) => (before as Record<string, unknown>)[k] !== v),
    );
    await audit(tx, {
      accountId: ctx.accountId,
      actorUserId: ctx.userId,
      action: 'account.updated',
      entityType: 'account',
      entityId: ctx.accountId,
      data: { changed: Object.keys(changed) },
    });
    return after!;
  }).then(async (after) => {
    await syncObligationsSafely(db, ctx.accountId);
    return after;
  });
}

export async function listUserAccounts(db: Db, userId: string) {
  return db
    .select({ id: accounts.id, name: accounts.name, legalForm: accounts.legalForm, role: memberships.role })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(eq(memberships.userId, userId));
}
