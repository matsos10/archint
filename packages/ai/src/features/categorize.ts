import { z } from 'zod';
import type { AiFeature } from '../runner';

export interface CategorizeInput {
  transactions: { id: string; date: string; description: string; amountCents: number }[];
  categories: { code: string; name: string; kind: string }[];
  /** Exemplos aprendidos com as correções do utilizador. */
  examples: { description: string; categoryCode: string }[];
}

const output = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      categoryCode: z.string(),
      confidence: z.number(),
      reason: z.string(),
    }),
  ),
});

export interface CategoryProposal {
  items: { id: string; categoryCode: string; confidence: number; reason: string }[];
}

export const categorizeFeature: AiFeature<CategorizeInput, z.infer<typeof output>, CategoryProposal> = {
  name: 'categorize',
  effort: 'low',
  maxTokens: 4000,
  timeoutMs: 30_000,
  system: [
    'És um assistente de contabilidade para trabalhadores independentes e pequenas empresas em Portugal.',
    'Propõe a categoria contabilística de cada movimento bancário, escolhendo SÓ entre os códigos fornecidos.',
    'Entradas (montante positivo) só podem ter categorias de receita, imposto ou transferência; saídas, de despesa, imposto, pessoal ou transferência.',
    'Se não houver indícios suficientes, usa confiança baixa (abaixo de 0,5) em vez de adivinhar. A razão deve ser curta, em português de Portugal.',
    'Segue os exemplos do utilizador quando o comerciante for o mesmo.',
  ].join('\n'),
  output,
  build: (i) => [
    {
      type: 'text',
      text: JSON.stringify({
        categorias: i.categories.map((c) => ({ codigo: c.code, nome: c.name, tipo: c.kind })),
        exemplos: i.examples.slice(0, 40),
        movimentos: i.transactions.map((t) => ({ id: t.id, data: t.date, descricao: t.description.slice(0, 200), montante: t.amountCents / 100 })),
      }),
    },
  ],
  summarize: (i) => ({ transactions: i.transactions.length, examples: i.examples.length }),
  validate: (out, input) => {
    const ids = new Map(input.transactions.map((t) => [t.id, t]));
    const kinds = new Map(input.categories.map((c) => [c.code, c.kind]));
    const issues: string[] = [];
    const items = out.items.filter((it) => {
      const t = ids.get(it.id);
      const kind = kinds.get(it.categoryCode);
      if (!t || !kind) {
        issues.push(`Proposta ignorada: ${!t ? 'movimento' : 'categoria'} desconhecido(a).`);
        return false;
      }
      if (t.amountCents > 0 && (kind === 'expense' || kind === 'personal')) {
        issues.push(`Proposta ignorada: despesa numa entrada (${it.id}).`);
        return false;
      }
      if (t.amountCents < 0 && kind === 'income') {
        issues.push(`Proposta ignorada: receita numa saída (${it.id}).`);
        return false;
      }
      return true;
    });
    const unique = [...new Map(items.map((it) => [it.id, { ...it, confidence: Math.min(0.9, Math.max(0, it.confidence)) }])).values()];
    return { proposal: unique.length ? { items: unique } : null, issues };
  },
};
