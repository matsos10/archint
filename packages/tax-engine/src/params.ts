import { z } from 'zod';
import { IRS_INCOME_TYPES, type IrsIncomeType } from './types';

/**
 * Parâmetros fiscais de um ano. Nunca estão fixos no código: vêm da tabela `tax_parameter_sets`
 * (versionada e editável), semeada a partir de `params/<ano>.json`, e são validados por este schema.
 */

const cents = z.number().int().nonnegative();
const rate = z.number().min(0).max(1);
const pct = z.number().min(0).max(100);
const monthDay = z.string().regex(/^\d{2}-\d{2}$/, 'Formato MM-DD');

const incomeTypeRecord = <T extends z.ZodType>(schema: T) =>
  z.object(Object.fromEntries(IRS_INCOME_TYPES.map((k) => [k, schema])) as Record<IrsIncomeType, T>);

const vatRates = z.object({ normal: pct, intermedia: pct, reduzida: pct });

export const referenceSchema = z.object({
  /** Referência legal (artigo e diploma). */
  legal: z.string().min(3),
  url: z.url().optional(),
  /** true = valor sujeito a confirmação nas fontes oficiais (alterações recentes, propostas, incerteza). */
  verify: z.boolean().default(false),
  note: z.string().optional(),
});

export const taxParamsSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  currency: z.literal('EUR').default('EUR'),
  /** Referências legais por caminho do parâmetro (ex.: "irs.brackets"). */
  references: z.record(z.string(), referenceSchema),

  vat: z.object({
    rates: z.object({ continente: vatRates, madeira: vatRates, acores: vatRates }),
    /** Volume de negócios a partir do qual a periodicidade é mensal (art. 41.º, n.º 1, a) CIVA). */
    monthlyPeriodicityThresholdCents: cents,
    art53: z.object({
      /** Limite de volume de negócios do regime especial de isenção. */
      thresholdCents: cents,
      /** Limite acima do qual a isenção cessa de imediato (ultrapassagem > 25%). */
      immediateExitThresholdCents: cents,
    }),
    deadlines: z.object({
      declarationDay: z.number().int().min(1).max(31),
      paymentDay: z.number().int().min(1).max(31),
      /** N.º de meses após o fim do período (ex.: 2 = "2.º mês seguinte"). */
      monthsAfterPeriodEnd: z.number().int().min(1).max(3),
    }),
    /** % de IVA dedutível por natureza da despesa (art. 21.º CIVA). Chave = código usado nas categorias. */
    deductibility: z.record(z.string(), pct),
  }),

  irs: z.object({
    /** Escalões do art. 68.º CIRS; o último tem upToCents = null. */
    brackets: z
      .array(z.object({ upToCents: cents.nullable(), rate }))
      .min(2)
      .refine((b) => b.length > 0 && b.at(-1)!.upToCents === null, 'O último escalão não tem limite superior')
      .refine(
        (b) => b.slice(0, -1).every((x, i, arr) => x.upToCents !== null && (i === 0 || x.upToCents > arr[i - 1]!.upToCents!)),
        'Limites dos escalões têm de ser crescentes',
      ),
    /** Taxa adicional de solidariedade (art. 68.º-A CIRS). */
    solidarity: z.array(z.object({ fromCents: cents, toCents: cents.nullable(), rate })),
    simplified: z.object({
      coefficients: incomeTypeRecord(rate),
      startReduction: z.object({
        firstYear: rate,
        secondYear: rate,
        appliesTo: z.array(z.enum(IRS_INCOME_TYPES as [IrsIncomeType, ...IrsIncomeType[]])),
      }),
      expenseJustification: z.object({
        pct: rate,
        appliesTo: z.array(z.enum(IRS_INCOME_TYPES as [IrsIncomeType, ...IrsIncomeType[]])),
      }),
      /** Acima deste volume de rendimentos é obrigatória a contabilidade organizada (art. 28.º CIRS). */
      maxGrossCents: cents,
    }),
    /** Dedução específica da categoria A (art. 25.º, n.º 1, a) CIRS), também usada na justificação dos 15%. */
    specificDeductionCents: cents,
    minimoExistenciaCents: cents,
    deductions: z.object({
      generalFamilyPct: rate,
      generalFamilyCapPerTaxpayerCents: cents,
      healthPct: rate,
      healthCapCents: cents,
      educationPct: rate,
      educationCapCents: cents,
      dependentCents: cents,
      dependentUnder6ExtraCents: cents,
    }),
    withholding: z.object({
      rates: z.object({ servicos_tabela_151: rate, servicos_outros: rate, propriedade_intelectual: rate }),
      /** Dispensa de retenção quando os rendimentos do ano anterior não excedem este valor (art. 101.º-B CIRS). */
      exemptionThresholdCents: cents,
    }),
    paymentsOnAccount: z.object({
      rate,
      minimumCents: cents,
      dueDates: z.array(monthDay).length(3),
    }),
    modelo3: z.object({ windowStart: monthDay, windowEnd: monthDay }),
  }),

  socialSecurity: z.object({
    iasCents: cents,
    rate,
    rateEniWithSpouse: rate,
    /** Rendimento relevante: % do valor das prestações/vendas (art. 162.º Código Contributivo). */
    relevantIncomeCoefficients: incomeTypeRecord(rate),
    minimumContributionCents: cents,
    maxBaseIasMultiple: z.number().positive(),
    exemptionFirstMonths: z.number().int().min(0),
    accumulationExemption: z.object({
      maxRelevantMonthlyIasMultiple: z.number().positive(),
      minEmploymentMonthlyIasMultiple: z.number().positive(),
    }),
    baseAdjustment: z.object({ minPct: z.number(), maxPct: z.number(), stepPct: z.number().positive() }),
    declarationMonths: z.array(z.number().int().min(1).max(12)).length(4),
    paymentDay: z.number().int().min(1).max(31),
    paymentWindowStartDay: z.number().int().min(1).max(31),
  }),

  irc: z.object({
    rate,
    smeRate: rate,
    smeLimitCents: cents,
    municipalSurchargeRate: rate,
    stateSurcharge: z.array(z.object({ fromCents: cents, toCents: cents.nullable(), rate })),
    modelo22Deadline: monthDay,
    iesDeadline: monthDay,
    paymentsOnAccountDueDates: z.array(monthDay).length(3),
  }),

  obligations: z.object({
    /** Comunicação dos elementos das faturas à AT (DL 198/2012): dia do mês seguinte. */
    efaturaCommunicationDay: z.number().int().min(1).max(31),
    /** Declaração mensal de remunerações (AT e Segurança Social): dia do mês seguinte. */
    payrollDeclarationDay: z.number().int().min(1).max(31),
  }),
});

export type TaxParams = z.infer<typeof taxParamsSchema>;
export type TaxParamsInput = z.input<typeof taxParamsSchema>;

export function parseTaxParams(input: unknown): TaxParams {
  return taxParamsSchema.parse(input);
}

export function safeParseTaxParams(input: unknown) {
  return taxParamsSchema.safeParse(input);
}

/** Referência legal de um parâmetro (com o aviso de verificação, quando aplicável). */
export function legalRef(params: TaxParams, key: string): string {
  const r = params.references[key];
  if (!r) return '';
  return r.verify ? `${r.legal} (a confirmar nas fontes oficiais)` : r.legal;
}

/** Lista dos parâmetros marcados para verificação (mostrados no painel de administração e nos avisos). */
export function paramsToVerify(params: TaxParams) {
  return Object.entries(params.references)
    .filter(([, r]) => r.verify)
    .map(([key, r]) => ({ key, ...r }));
}

/** Resolve parâmetros por ano (o worker/web injeta uma implementação baseada na BD). */
export type ParamsResolver = (year: number) => TaxParams;

/**
 * Cria um resolvedor a partir dos conjuntos publicados. Se não houver parâmetros para o ano pedido,
 * usa o ano mais próximo (anterior, senão posterior) — útil para prazos de períodos de anos sem
 * parâmetros carregados. Os cálculos de imposto devem confirmar `params.year === ano`.
 */
export function createParamsResolver(sets: TaxParams[]): ParamsResolver {
  const byYear = new Map(sets.map((s) => [s.year, s]));
  const years = [...byYear.keys()].sort((a, b) => a - b);
  return (year: number) => {
    const exact = byYear.get(year);
    if (exact) return exact;
    const earlier = years.filter((y) => y < year).at(-1);
    const later = years.find((y) => y > year);
    const y = earlier ?? later;
    if (y === undefined) throw new Error(`Sem parâmetros fiscais para ${year}`);
    return byYear.get(y)!;
  };
}
