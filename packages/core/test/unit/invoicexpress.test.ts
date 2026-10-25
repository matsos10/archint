import { describe, expect, it } from 'vitest';
import { computeInvoice, parseTaxParams } from '@somar/tax-engine';
import p2025 from '@somar/tax-engine/params/2025.json';
import { InvoiceXpressProvider } from '../../src';

describe('cliente InvoiceXpress (software certificado)', () => {
  it('cria, finaliza e obtém o PDF do documento', async () => {
    const params = parseTaxParams(p2025);
    const totals = computeInvoice([{ description: 'Serviço', quantity: 1, unitPriceCents: 100000, vatRateCode: 'normal' }], { region: 'continente', vatRegime: 'normal_trimestral', incomeType: 'servicos_tabela_151', providerIsIndividual: true, providerWithholdingExempt: false, clientHasOrganizedAccounting: true }, params);
    const calls: { method: string; path: string; body?: Record<string, unknown> }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      calls.push({ method: init?.method ?? 'GET', path: u.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      expect(u.searchParams.get('api_key')).toBe('k');
      if (u.hostname === 'files.example') return new Response(Buffer.from('%PDF-1.4'), { status: 200 });
      if (u.pathname === '/invoices.json') return Response.json({ invoice: { id: 42 } }, { status: 201 });
      if (u.pathname === '/invoices/42/change-state.json')
        return Response.json({ invoice: { id: 42, sequence_number: '7/2026A', inverted_sequence_number: '2026A/7', atcud: 'ABCD1234-7', qr_code: 'A:123*B:456', saft_hash: 'Xy9Z' } });
      if (u.pathname === '/api/pdf/42.json') return Response.json({ output: { pdfUrl: 'https://files.example/x.pdf?api_key=k' } });
      return new Response('?', { status: 404 });
    }) as unknown as typeof fetch;
    const ix = new InvoiceXpressProvider({ account: 'conta', apiKey: 'k', certificateNumber: '1234' }, fake);
    const r = await ix.issue({
      docType: 'FT',
      issueDate: '2026-03-10',
      series: { code: '2026A', validationCode: 'ABCD1234', providerSeriesId: '99' },
      localSequence: 1,
      issuer: { name: 'Marta', nif: '234567899', region: 'continente' },
      client: { name: 'Cliente, Lda.', nif: '509123457' },
      totals,
      reference: 'ref-1',
    });
    expect(r).toMatchObject({ number: 'FT 2026A/7', sequence: 7, atcud: 'ABCD1234-7', qrPayload: 'A:123*B:456', documentHash: 'Xy9Z', providerRef: 'invoicexpress:invoices:42', legallyValid: true });
    expect(r.pdf?.toString()).toBe('%PDF-1.4');
    const created = calls[0]!.body!.invoice as Record<string, unknown>;
    expect(created).toMatchObject({ date: '10/03/2026', retention: '23', sequence_id: '99' });
    expect((created.items as { tax: { name: string } }[])[0]!.tax.name).toBe('IVA23');
    expect(calls[1]).toMatchObject({ method: 'PUT', body: { invoice: { state: 'finalized' } } });
  });
});
