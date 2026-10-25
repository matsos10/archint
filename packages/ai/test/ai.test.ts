import { describe, expect, it } from 'vitest';
import { parseTaxParams } from '@somar/tax-engine';
import p2025 from '@somar/tax-engine/params/2025.json';
import {
  AnthropicLlmClient,
  LlmError,
  MockLlmClient,
  categorizeFeature,
  explainFeature,
  receiptFeature,
  reminderFeature,
  runFeature,
  toWireSchema,
  unknownAmounts,
  type AiLogEntry,
} from '../src';

const params = parseTaxParams(p2025);
const catInput = {
  transactions: [
    { id: 't1', date: '2025-03-01', description: 'COMPRA LIVRARIA BERTRAND', amountCents: -2500 },
    { id: 't2', date: '2025-03-02', description: 'TRF CLIENTE ABC', amountCents: 100000 },
  ],
  categories: [
    { code: 'formacao', name: 'Formação', kind: 'expense' },
    { code: 'receita_servicos', name: 'Prestação de serviços', kind: 'income' },
  ],
  examples: [],
};

function deps(script: ConstructorParameters<typeof MockLlmClient>[0], allow = true) {
  const logs: AiLogEntry[] = [];
  return { logs, deps: { llm: new MockLlmClient(script), allow: async () => allow, log: async (e: AiLogEntry) => (logs.push(e), `log-${logs.length}`) } };
}

describe('executor de IA', () => {
  it('aceita uma resposta válida, valida-a e regista o pedido', async () => {
    const { deps: d, logs } = deps({
      categorize: () => JSON.stringify({ items: [{ id: 't1', categoryCode: 'formacao', confidence: 0.99, reason: 'Livraria' }, { id: 't2', categoryCode: 'receita_servicos', confidence: 0.7, reason: 'Cliente' }] }),
    });
    const r = await runFeature(categorizeFeature, catInput, d);
    expect(r.status).toBe('ok');
    expect(r.proposal!.items.map((i) => [i.id, i.categoryCode, i.confidence])).toEqual([['t1', 'formacao', 0.9], ['t2', 'receita_servicos', 0.7]]); // confiança limitada a 0,9
    expect(r.logId).toBe('log-1');
    expect(logs[0]).toMatchObject({ feature: 'categorize', status: 'ok', request: { transactions: 2, examples: 0 } });
    // Dados minimizados: o pedido ao modelo não contém ids de conta nem IBAN, só o necessário
    const sent = (d.llm as MockLlmClient).calls[0]!;
    expect(JSON.stringify(sent.content)).not.toMatch(/iban|account/i);
    expect(sent.jsonSchema).toMatchObject({ type: 'object', additionalProperties: false, required: ['items'] });
  });

  it('rejeita propostas que violam as regras de domínio (categoria inexistente, direção errada)', async () => {
    const { deps: d } = deps({
      categorize: () => JSON.stringify({ items: [{ id: 't1', categoryCode: 'inventada', confidence: 0.9, reason: '' }, { id: 't2', categoryCode: 'formacao', confidence: 0.9, reason: '' }, { id: 'tX', categoryCode: 'formacao', confidence: 0.9, reason: '' }] }),
    });
    const r = await runFeature(categorizeFeature, catInput, d);
    expect(r.status).toBe('invalid_output');
    expect(r.proposal).toBeNull();
    expect(r.issues).toHaveLength(3);
  });

  it('trata JSON inválido e respostas fora do schema', async () => {
    const a = await runFeature(categorizeFeature, catInput, deps({ categorize: () => 'isto não é json' }).deps);
    expect(a).toMatchObject({ status: 'invalid_output', proposal: null });
    const b = await runFeature(categorizeFeature, catInput, deps({ categorize: () => JSON.stringify({ items: [{ id: 't1' }] }) }).deps);
    expect(b.status).toBe('invalid_output');
    expect(b.issues[0]).toMatch(/categoryCode/);
  });

  it('API indisponível, timeout, IA desligada e limite atingido: sem proposta, a app segue sem IA', async () => {
    const down = await runFeature(categorizeFeature, catInput, deps({ categorize: () => new LlmError('unavailable', 'down') }).deps);
    expect(down).toMatchObject({ status: 'error', proposal: null });
    const slow = await runFeature(categorizeFeature, catInput, deps({ categorize: () => new LlmError('timeout', 'slow') }).deps);
    expect(slow.status).toBe('timeout');
    const logs: AiLogEntry[] = [];
    const off = await runFeature(categorizeFeature, catInput, { llm: null, log: async (e) => (logs.push(e), 'x') });
    expect(off.status).toBe('disabled');
    expect(logs[0]!.status).toBe('disabled');
    const limited = deps({ categorize: () => '{}' }, false);
    expect((await runFeature(categorizeFeature, catInput, limited.deps)).status).toBe('rate_limited');
    expect((limited.deps.llm as MockLlmClient).calls).toHaveLength(0);
  });
});

describe('extração de justificativos (OCR)', () => {
  const input = { file: { mimeType: 'image/jpeg', base64: 'AAAA' }, accountNif: '234567899', region: 'continente' as const, params };
  const ok = { isInvoice: true, supplierName: 'Galp Energia, S.A.', supplierNif: '506012344', buyerNif: '234567899', documentNumber: 'FS 1/9', atcud: 'ABC-9', documentDate: '2025-05-14', totalEuros: 61.5, vatEuros: 11.5, vatRateCode: 'normal', confidence: 0.92 };

  it('converte para cêntimos e valida o IVA com o motor fiscal', async () => {
    const r = await runFeature(receiptFeature, input, deps({ receipt_ocr: () => JSON.stringify(ok) }).deps);
    expect(r.proposal).toMatchObject({ totalCents: 6150, vatCents: 1150, supplierNif: '506012344', confidence: 0.92, issues: [] });
  });

  it('baixa a confiança e avisa: NIF inválido, IVA incoerente, sem o NIF do cliente', async () => {
    const r = await runFeature(receiptFeature, input, deps({ receipt_ocr: () => JSON.stringify({ ...ok, supplierNif: '506012345', buyerNif: null, vatEuros: 9 }) }).deps);
    expect(r.proposal!.supplierNif).toBeUndefined();
    expect(r.proposal!.issues).toHaveLength(3);
    expect(r.proposal!.confidence).toBeLessThan(0.5);
    const bad = await runFeature(receiptFeature, input, deps({ receipt_ocr: () => JSON.stringify({ ...ok, totalEuros: -5 }) }).deps);
    expect(bad.proposal).toBeNull();
  });
});

describe('textos gerados', () => {
  it('a explicação não pode conter montantes que o motor não calculou', async () => {
    const input = { question: 'Porque vou pagar este IVA?', facts: [{ label: 'IVA liquidado', amountCents: 110400 }, { label: 'IVA dedutível', amountCents: 52900 }, { label: 'IVA a pagar', amountCents: 57500 }] };
    const good = await runFeature(explainFeature, input, deps({ explain: () => JSON.stringify({ title: 'IVA do 1.º trimestre', paragraphs: ['Cobraste 1104,00 € de IVA e podes deduzir 529,00 €. Pagas a diferença: 575,00 €.'] }) }).deps);
    expect(good.status).toBe('ok');
    const bad = await runFeature(explainFeature, input, deps({ explain: () => JSON.stringify({ title: 'IVA', paragraphs: ['Vais pagar 999,00 €.'] }) }).deps);
    expect(bad.status).toBe('invalid_output');
    expect(unknownAmounts('total de 1 104,00 € e 12 euros', [110400])).toEqual([1200]);
  });

  it('o lembrete tem de conter o número e o valor exatos e nenhum outro valor', async () => {
    const input = { stage: 2, number: 'FT 2025A/8', amountText: '2400,00 €', dueDateText: '18/01/2026', daysLate: 16, clientName: 'Padaria Lusa', accountName: 'Marta' };
    const ok = await runFeature(reminderFeature, input, deps({ reminder: () => JSON.stringify({ subject: 'Fatura FT 2025A/8', body: 'Olá! A fatura FT 2025A/8, de 2400,00 €, venceu a 18/01/2026. Obrigada, Marta' }) }).deps);
    expect(ok.status).toBe('ok');
    const bad = await runFeature(reminderFeature, input, deps({ reminder: () => JSON.stringify({ subject: 'x', body: 'Pague 2500,00 € com juros em https://x.pt' }) }).deps);
    expect(bad.proposal).toBeNull();
    expect(bad.issues.length).toBeGreaterThanOrEqual(3);
    const iban = 'PT50000201231234567890154';
    const d = deps({ reminder: () => JSON.stringify({ subject: 'Fatura FT 2025A/8', body: 'A fatura FT 2025A/8, de 2400,00 €, venceu a 18/01/2026.' }) });
    const withIban = await runFeature(reminderFeature, { ...input, iban }, d.deps);
    expect(JSON.stringify((d.deps.llm as MockLlmClient).calls[0])).not.toContain(iban);
    expect(withIban.proposal!.body).toContain(`IBAN para pagamento: ${iban}`);
  });
});

describe('cliente Anthropic', () => {
  it('envia saída estruturada, modelo, esforço e fallback; converte recusas e erros', async () => {
    let captured: { headers: Headers; body: Record<string, unknown> } | undefined;
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    const message = (stop: string, text = '{"items":[]}') => ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text }], stop_reason: stop, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 5 } });
    let next: Response = reply(200, message('end_turn'));
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      captured = { headers: new Headers(init.headers), body: JSON.parse(String(init.body)) };
      return next;
    }) as unknown as typeof fetch;
    const llm = new AnthropicLlmClient({ apiKey: 'test', maxRetries: 0, fetch: fakeFetch });
    const req = { feature: 'categorize', system: 's', content: [{ type: 'text' as const, text: 'oi' }], jsonSchema: toWireSchema(categorizeFeature.output), effort: 'low' as const, maxTokens: 100, timeoutMs: 5000 };
    const r = await llm.complete(req);
    expect(r).toMatchObject({ text: '{"items":[]}', model: 'claude-opus-5-5', inputTokens: 12 });
    expect(captured!.body).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 100, fallbacks: 'default', output_config: { effort: 'low', format: { type: 'json_schema' } } });
    expect(captured!.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    next = reply(200, message('refusal'));
    await expect(llm.complete(req)).rejects.toMatchObject({ kind: 'refused' });
    next = reply(529, { type: 'error', error: { type: 'overloaded_error', message: 'x' } });
    await expect(llm.complete(req)).rejects.toMatchObject({ kind: 'unavailable' });
    next = reply(400, { type: 'error', error: { type: 'invalid_request_error', message: 'x' } });
    await expect(llm.complete(req)).rejects.toMatchObject({ kind: 'error' });
    next = reply(500, { type: 'error', error: { type: 'api_error', message: 'x' } });
    await expect(llm.complete(req)).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
