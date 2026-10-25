import { z } from 'zod';
import type { AiFeature } from '../runner';
import { unknownAmounts } from '../money-check';

// ---------------------------------------------------------------------------
// Explicações em linguagem simples (obrigações, estimativas, alertas)
// ---------------------------------------------------------------------------

export interface ExplainInput {
  question: string;
  facts: { label: string; amountCents?: number; legalRef?: string }[];
}

const explainOut = z.object({ title: z.string(), paragraphs: z.array(z.string()) });
export interface Explanation {
  title: string;
  paragraphs: string[];
}

export const explainFeature: AiFeature<ExplainInput, z.infer<typeof explainOut>, Explanation> = {
  name: 'explain',
  effort: 'low',
  maxTokens: 1500,
  system: [
    'Explicas impostos portugueses a pessoas sem formação em contabilidade, em português de Portugal, com frases curtas.',
    'Usa APENAS os números e factos fornecidos (calculados pelo motor fiscal). Nunca inventes valores, taxas ou prazos.',
    'Máximo de 3 parágrafos. Menciona a referência legal quando útil. Não dês conselhos para fugir a impostos.',
  ].join('\n'),
  output: explainOut,
  build: (i) => [{ type: 'text', text: JSON.stringify({ pergunta: i.question, factos: i.facts.map((f) => ({ ...f, valor: f.amountCents != null ? f.amountCents / 100 : undefined, amountCents: undefined })) }) }],
  summarize: (i) => ({ question: i.question.slice(0, 200), facts: i.facts.length }),
  validate: (o, input) => {
    const text = [o.title, ...o.paragraphs].join('\n');
    const bad = unknownAmounts(text, input.facts.flatMap((f) => (f.amountCents != null ? [f.amountCents] : [])));
    if (bad.length) return { proposal: null, issues: [`Montantes não suportados pelos cálculos: ${bad.map((b) => (b / 100).toFixed(2)).join(', ')}`] };
    if (o.paragraphs.length === 0 || text.length > 2500) return { proposal: null, issues: ['Explicação vazia ou demasiado longa.'] };
    return { proposal: { title: o.title.slice(0, 160), paragraphs: o.paragraphs.slice(0, 3) }, issues: [] };
  },
};

// ---------------------------------------------------------------------------
// Assistente de chat
// ---------------------------------------------------------------------------

export interface AssistantInput {
  question: string;
  profile: Record<string, string>;
  figures: { label: string; amountCents: number }[];
  history: { role: 'user' | 'assistant'; content: string }[];
}

const assistantOut = z.object({ answer: z.string(), followUps: z.array(z.string()), needsAccountant: z.boolean() });
export interface AssistantAnswer {
  answer: string;
  followUps: string[];
  needsAccountant: boolean;
}

export const ASSISTANT_DISCLAIMER = 'Esta resposta é informativa e não substitui um contabilista certificado.';

export const assistantFeature: AiFeature<AssistantInput, z.infer<typeof assistantOut>, AssistantAnswer> = {
  name: 'assistant',
  effort: 'medium',
  maxTokens: 3000,
  timeoutMs: 45_000,
  system: [
    'És o assistente do Somar, uma app de contabilidade para independentes e pequenas empresas em Portugal.',
    'Respondes em português de Portugal, de forma clara e breve, sobre a situação fiscal do utilizador com base no perfil e nos valores fornecidos (calculados pelo motor fiscal).',
    'Não inventes valores: se um número não estiver nos dados, explica como se calcula ou onde o encontrar. Não submetes declarações nem alteras dados.',
    'Quando a questão for complexa, ambígua, envolver litígio, planeamento fiscal agressivo ou decisões irreversíveis, indica needsAccountant = true.',
    'Recusa ajudar a ocultar rendimentos ou a evitar obrigações legais.',
  ].join('\n'),
  output: assistantOut,
  build: (i) => [
    {
      type: 'text',
      text: JSON.stringify({
        perfil: i.profile,
        valores: i.figures.map((f) => ({ descricao: f.label, euros: f.amountCents / 100 })),
        conversa: i.history.slice(-8),
        pergunta: i.question.slice(0, 2000),
      }),
    },
  ],
  summarize: (i) => ({ question: i.question.slice(0, 300), historyTurns: i.history.length }),
  validate: (o, input) => {
    const bad = unknownAmounts(o.answer, input.figures.map((f) => f.amountCents));
    const issues = bad.length ? [`Valores não verificados na resposta: ${bad.map((b) => (b / 100).toFixed(2)).join(', ')} €`] : [];
    // Uma resposta com valores não verificados é devolvida com aviso (não bloqueada), para não esconder a resposta;
    // a UI mostra o aviso ao lado.
    if (!o.answer.trim()) return { proposal: null, issues: ['Resposta vazia.'] };
    return { proposal: { answer: o.answer.slice(0, 6000), followUps: o.followUps.slice(0, 3), needsAccountant: o.needsAccountant || bad.length > 0 }, issues };
  },
};

// ---------------------------------------------------------------------------
// Lembretes de cobrança personalizados
// ---------------------------------------------------------------------------

export interface ReminderInput {
  stage: number;
  number: string;
  amountText: string;
  dueDateText: string;
  daysLate: number;
  clientName: string;
  accountName: string;
  iban?: string | null;
  previous?: string[];
}

const reminderOut = z.object({ subject: z.string(), body: z.string() });

export const reminderFeature: AiFeature<ReminderInput, z.infer<typeof reminderOut>, { subject: string; body: string }> = {
  name: 'reminder',
  effort: 'low',
  maxTokens: 800,
  system: [
    'Escreves emails curtos de lembrete de pagamento em português de Portugal, em nome de um trabalhador independente ou pequena empresa.',
    'Tom cordial no 1.º lembrete, mais direto no 2.º e firme mas educado no 3.º. Sem ameaças nem juros não acordados.',
    'Inclui exatamente o número da fatura, o valor e a data de vencimento fornecidos. Não incluas outros valores, links nem dados bancários (o IBAN é acrescentado automaticamente).',
  ].join('\n'),
  output: reminderOut,
  // Minimização: o IBAN nunca é enviado ao fornecedor de IA; é acrescentado depois, de forma determinística.
  build: ({ iban: _iban, ...i }) => [{ type: 'text', text: JSON.stringify(i) }],
  summarize: (i) => ({ stage: i.stage, daysLate: i.daysLate }),
  validate: (o, input) => {
    const issues: string[] = [];
    const norm = (t: string) => t.replace(/[\u00a0\u202f]/g, ' ');
    if (!norm(o.body).includes(norm(input.number))) issues.push('Falta o número da fatura.');
    if (!norm(o.body).includes(norm(input.amountText))) issues.push('Falta o valor exato.');
    if (/https?:\/\//i.test(o.body)) issues.push('Contém links.');
    const amount = Math.round(Number(input.amountText.replace(/[^\d,]/g, '').replace(',', '.')) * 100);
    if (unknownAmounts(o.body, [amount]).length) issues.push('Contém outros valores.');
    if (o.body.length > 1500 || o.subject.length > 120) issues.push('Texto demasiado longo.');
    const body = o.body.trim() + (input.iban ? `\n\nIBAN para pagamento: ${input.iban}` : '');
    return { proposal: issues.length ? null : { subject: o.subject.trim(), body }, issues };
  },
};
