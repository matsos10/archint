import { z } from 'zod';
import { LlmError, type LlmClient, type LlmContent } from './llm';

/**
 * Executor de funcionalidades de IA. Regra de ouro: a IA propõe, o motor fiscal valida, o utilizador
 * confirma. Toda a saída passa por (1) validação de schema Zod e (2) validação de domínio antes de ser
 * devolvida como proposta. Qualquer falha (IA desligada, limite, timeout, erro, saída inválida) devolve
 * um resultado sem proposta e a app segue o caminho sem IA.
 */

export type AiStatus = 'ok' | 'invalid_output' | 'error' | 'timeout' | 'rate_limited' | 'disabled';

export interface AiFeature<I, O, P> {
  name: string;
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
  timeoutMs?: number;
  system: string;
  output: z.ZodType<O>;
  /** Conteúdo do pedido (dados minimizados). */
  build: (input: I) => LlmContent[];
  /** Validação de domínio (motor fiscal, listas permitidas). Devolve a proposta final e avisos. */
  validate: (output: O, input: I) => { proposal: P | null; issues: string[] };
  /** Resumo do pedido para o registo de IA (sem conteúdos binários). */
  summarize?: (input: I) => Record<string, unknown>;
}

export interface AiLogEntry {
  feature: string;
  model: string | null;
  request: Record<string, unknown>;
  response: Record<string, unknown> | null;
  status: AiStatus;
  error: string | null;
  proposal: Record<string, unknown> | null;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AiDeps {
  llm: LlmClient | null;
  /** Verifica (e consome) a quota do utilizador; false = limite atingido. */
  allow?: (feature: string) => Promise<boolean>;
  /** Persiste o registo e devolve o seu id. */
  log?: (entry: AiLogEntry) => Promise<string | undefined>;
}

export interface AiResult<P> {
  status: AiStatus;
  proposal: P | null;
  issues: string[];
  logId?: string;
  error?: string;
}

/** Converte um schema Zod em JSON Schema compatível com saída estruturada (sem palavras-chave não suportadas). */
export function toWireSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' }) as Record<string, unknown>;
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (['$schema', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'pattern', 'format', 'minItems', 'maxItems', 'default'].includes(k)) continue;
      out[k] = strip(v);
    }
    if (out.type === 'object') {
      out.additionalProperties = false;
      if (out.properties && !out.required) out.required = Object.keys(out.properties as object);
    }
    return out;
  };
  return strip(json) as Record<string, unknown>;
}

const statusOf = (e: unknown): AiStatus =>
  e instanceof LlmError ? (e.kind === 'timeout' ? 'timeout' : e.kind === 'rate_limited' ? 'rate_limited' : 'error') : 'error';

export async function runFeature<I, O, P>(feature: AiFeature<I, O, P>, input: I, deps: AiDeps): Promise<AiResult<P>> {
  const started = Date.now();
  const request = feature.summarize?.(input) ?? {};
  const finish = async (r: AiResult<P>, extra: Partial<AiLogEntry> = {}) => {
    const logId = await deps
      .log?.({
        feature: feature.name,
        model: deps.llm?.model ?? null,
        request,
        response: null,
        status: r.status,
        error: r.error ?? null,
        proposal: (r.proposal as Record<string, unknown> | null) ?? null,
        latencyMs: Date.now() - started,
        ...extra,
      })
      .catch(() => undefined);
    return { ...r, logId };
  };

  if (!deps.llm) return finish({ status: 'disabled', proposal: null, issues: [] });
  if (deps.allow && !(await deps.allow(feature.name))) {
    return finish({ status: 'rate_limited', proposal: null, issues: [], error: 'Limite de pedidos de IA atingido.' });
  }
  let text: string;
  let meta: Partial<AiLogEntry> = {};
  try {
    const res = await deps.llm.complete({
      feature: feature.name,
      system: feature.system,
      content: feature.build(input),
      jsonSchema: toWireSchema(feature.output),
      effort: feature.effort,
      maxTokens: feature.maxTokens,
      timeoutMs: feature.timeoutMs ?? 30_000,
    });
    text = res.text;
    meta = { model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens };
  } catch (e) {
    return finish({ status: statusOf(e), proposal: null, issues: [], error: e instanceof Error ? e.message : String(e) }, meta);
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    return finish({ status: 'invalid_output', proposal: null, issues: ['Resposta não é JSON válido.'], error: 'JSON inválido' }, { ...meta, response: { text: text.slice(0, 2000) } });
  }
  const parsed = feature.output.safeParse(parsedJson);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`);
    return finish({ status: 'invalid_output', proposal: null, issues, error: 'Resposta fora do schema' }, { ...meta, response: parsedJson as Record<string, unknown> });
  }
  const { proposal, issues } = feature.validate(parsed.data, input);
  return finish(
    { status: proposal ? 'ok' : 'invalid_output', proposal, issues, error: proposal ? undefined : 'Proposta rejeitada pela validação' },
    { ...meta, response: parsed.data as Record<string, unknown> },
  );
}
