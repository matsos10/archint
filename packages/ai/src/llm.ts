import Anthropic from '@anthropic-ai/sdk';

/**
 * Cliente de modelo de linguagem (com visão). A interface é mínima para poder ser simulada nos testes;
 * a implementação real usa o SDK oficial da Anthropic com saída estruturada (JSON Schema).
 */

export type LlmContent =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; base64: string }
  | { type: 'pdf'; base64: string };

export interface LlmRequest {
  feature: string;
  system: string;
  content: LlmContent[];
  /** JSON Schema da resposta esperada (objeto). */
  jsonSchema: Record<string, unknown>;
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
  timeoutMs: number;
}

export interface LlmResponse {
  text: string;
  model: string;
  stopReason: string | null;
  inputTokens?: number;
  outputTokens?: number;
}

export class LlmError extends Error {
  constructor(
    public readonly kind: 'timeout' | 'rate_limited' | 'unavailable' | 'refused' | 'truncated' | 'error',
    message: string,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface LlmClient {
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export const DEFAULT_MODEL = 'claude-opus-5-5';

export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(
    opts: { apiKey?: string; model?: string; maxRetries?: number; fetch?: typeof fetch } = {},
    readonly model = opts.model ?? DEFAULT_MODEL,
  ) {
    this.client = new Anthropic({ apiKey: opts.apiKey, maxRetries: opts.maxRetries ?? 1, fetch: opts.fetch });
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = req.content.map((c) => {
      if (c.type === 'text') return { type: 'text', text: c.text };
      if (c.type === 'image') return { type: 'image', source: { type: 'base64', media_type: c.mediaType, data: c.base64 } };
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: c.base64 } };
    });
    try {
      const res = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: [{ role: 'user', content }],
          output_config: { effort: req.effort, format: { type: 'json_schema', schema: req.jsonSchema } },
          // Em caso de recusa pelos classificadores de segurança, o servidor tenta um modelo alternativo.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        },
        { timeout: req.timeoutMs },
      );
      if (res.stop_reason === 'refusal') throw new LlmError('refused', 'O modelo recusou o pedido.');
      if (res.stop_reason === 'max_tokens') throw new LlmError('truncated', 'Resposta incompleta (limite de tokens).');
      const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      return { text, model: res.model, stopReason: res.stop_reason, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
    } catch (e) {
      if (e instanceof LlmError) throw e;
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw new LlmError('timeout', 'Tempo de resposta excedido.');
      if (e instanceof Anthropic.RateLimitError) throw new LlmError('rate_limited', 'Limite do fornecedor de IA atingido.');
      if (e instanceof Anthropic.APIConnectionError) throw new LlmError('unavailable', 'Serviço de IA indisponível.');
      if (e instanceof Anthropic.InternalServerError) throw new LlmError('unavailable', 'Serviço de IA indisponível.');
      if (e instanceof Anthropic.APIError) throw new LlmError('error', `Erro da API de IA (${e.status}).`);
      throw new LlmError('error', String(e));
    }
  }
}

/** Cliente simulado: devolve respostas programadas (texto ou erro) por funcionalidade, para testes. */
export class MockLlmClient implements LlmClient {
  readonly model = 'mock';
  readonly calls: LlmRequest[] = [];
  constructor(private readonly script: Record<string, (req: LlmRequest) => string | Error | Promise<string>>) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.calls.push(req);
    const fn = this.script[req.feature];
    if (!fn) throw new LlmError('unavailable', 'Sem resposta simulada');
    const out = await fn(req);
    if (out instanceof Error) throw out;
    return { text: out, model: 'mock', stopReason: 'end_turn', inputTokens: 10, outputTokens: 10 };
  }
}

/** Cliente configurado pelo ambiente: sem ANTHROPIC_API_KEY (nem AI_ENABLED), a IA fica desligada. */
export function defaultLlmClient(): LlmClient | null {
  if (process.env.AI_ENABLED === 'false') return null;
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  return new AnthropicLlmClient({ model: process.env.AI_MODEL || DEFAULT_MODEL });
}
