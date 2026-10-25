import { z } from 'zod';
import type { AiFeature } from '../runner';

// ---------------------------------------------------------------------------
// Natureza da despesa para o IVA (art. 21.º CIVA) e % profissional
// ---------------------------------------------------------------------------

export interface DeductibilityInput {
  description: string;
  amountCents: number;
  categoryName: string;
  keys: string[];
}

const deductOut = z.object({ vatDeductionKey: z.string(), businessPct: z.number(), rationale: z.string() });

export const deductibilityFeature: AiFeature<DeductibilityInput, z.infer<typeof deductOut>, z.infer<typeof deductOut>> = {
  name: 'vat_deductibility',
  effort: 'low',
  maxTokens: 600,
  system: [
    'Classificas a natureza de uma despesa para efeitos do direito à dedução do IVA em Portugal (art. 21.º CIVA), escolhendo SÓ uma das chaves fornecidas.',
    'Indica também a percentagem de uso profissional provável (100 para despesas claramente da atividade). Justifica numa frase.',
  ].join('\n'),
  output: deductOut,
  build: (i) => [{ type: 'text', text: JSON.stringify({ descricao: i.description, montante: i.amountCents / 100, categoria: i.categoryName, chaves: i.keys }) }],
  summarize: (i) => ({ category: i.categoryName }),
  validate: (o, input) => {
    if (!input.keys.includes(o.vatDeductionKey)) return { proposal: null, issues: ['Chave de dedução desconhecida.'] };
    const pct = Math.round(o.businessPct);
    if (pct < 0 || pct > 100) return { proposal: null, issues: ['Percentagem inválida.'] };
    return { proposal: { vatDeductionKey: o.vatDeductionKey, businessPct: pct, rationale: o.rationale.slice(0, 300) }, issues: [] };
  },
};

// ---------------------------------------------------------------------------
// Deteção de anomalias
// ---------------------------------------------------------------------------

export interface AnomalyInput {
  transactions: { id: string; date: string; description: string; amountCents: number; category?: string | null; hasReceipt: boolean }[];
}

const ANOMALY_TYPES = ['duplicate', 'unusual_amount', 'personal_expense', 'missing_invoice', 'other'] as const;
const anomalyOut = z.object({ items: z.array(z.object({ id: z.string(), type: z.enum(ANOMALY_TYPES), explanation: z.string() })) });
export type AnomalyProposal = z.infer<typeof anomalyOut>;

export const anomalyFeature: AiFeature<AnomalyInput, AnomalyProposal, AnomalyProposal> = {
  name: 'anomalies',
  effort: 'medium',
  maxTokens: 3000,
  system: [
    'Analisas movimentos bancários de um trabalhador independente/pequena empresa em Portugal e assinalas apenas anomalias prováveis:',
    'possíveis duplicados, montantes invulgares face ao histórico do mesmo comerciante, despesas aparentemente pessoais lançadas como da atividade, e recebimentos que deviam ter fatura.',
    'Sê conservador: no máximo 10 itens, com uma explicação curta em português de Portugal. Não repitas o óbvio.',
  ].join('\n'),
  output: anomalyOut,
  build: (i) => [{ type: 'text', text: JSON.stringify(i.transactions.slice(0, 300).map((t) => ({ ...t, montante: t.amountCents / 100, amountCents: undefined }))) }],
  summarize: (i) => ({ transactions: i.transactions.length }),
  validate: (o, input) => {
    const ids = new Set(input.transactions.map((t) => t.id));
    const items = o.items.filter((x) => ids.has(x.id)).slice(0, 10).map((x) => ({ ...x, explanation: x.explanation.slice(0, 300) }));
    return { proposal: { items }, issues: items.length < o.items.length ? ['Itens com movimentos desconhecidos foram ignorados.'] : [] };
  },
};

// ---------------------------------------------------------------------------
// Otimização fiscal: a IA escolhe e explica ações; o motor calcula o efeito
// ---------------------------------------------------------------------------

export const OPTIMIZATION_ACTIONS = [
  'switch_to_organized',
  'claim_withholding_exemption',
  'adjust_ss_base_down',
  'request_missing_receipts',
  'classify_efatura',
  'review_personal_expenses',
] as const;
export type OptimizationAction = (typeof OPTIMIZATION_ACTIONS)[number];

export interface OptimizationInput {
  situation: Record<string, string | number | boolean>;
  allowed: OptimizationAction[];
}

const optOut = z.object({ suggestions: z.array(z.object({ action: z.enum(OPTIMIZATION_ACTIONS), title: z.string(), rationale: z.string() })) });
export type OptimizationProposal = z.infer<typeof optOut>;

export const optimizationFeature: AiFeature<OptimizationInput, OptimizationProposal, OptimizationProposal> = {
  name: 'optimization',
  effort: 'medium',
  maxTokens: 1500,
  system: [
    'Sugeres oportunidades legais de poupança fiscal a um contribuinte português, escolhendo SÓ entre as ações permitidas.',
    'Não indiques valores de poupança (são calculados pelo motor fiscal). Título curto e justificação de uma ou duas frases, em português de Portugal.',
    'Nunca sugiras omitir rendimentos, faturar abaixo do real ou outras práticas ilegais.',
  ].join('\n'),
  output: optOut,
  build: (i) => [{ type: 'text', text: JSON.stringify({ situacao: i.situation, acoesPermitidas: i.allowed }) }],
  summarize: (i) => ({ allowed: i.allowed }),
  validate: (o, input) => {
    const suggestions = [...new Map(o.suggestions.filter((s) => input.allowed.includes(s.action)).map((s) => [s.action, { ...s, title: s.title.slice(0, 120), rationale: s.rationale.slice(0, 400) }])).values()];
    return { proposal: suggestions.length ? { suggestions } : null, issues: [] };
  },
};
