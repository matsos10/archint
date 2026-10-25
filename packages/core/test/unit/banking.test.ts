import { describe, expect, it } from 'vitest';
import {
  GoCardlessAggregator,
  bestMatch,
  categorize,
  matchScore,
  merchantKey,
  normalizeDescription,
  parseAmount,
  parseBankCsv,
  parseDate,
  parseOfx,
  transactionFingerprint,
  type RuleLike,
} from '../../src';

describe('montantes e datas', () => {
  it.each([
    ['1.234,56', 123456],
    ['-1.234,56', -123456],
    ['1234.56', 123456],
    ['1,234.56', 123456],
    ['12,50 €', 1250],
    ['(12,50)', -1250],
    ['12,50-', -1250],
    ['1.234', 123400],
    ['0,05', 5],
    ['+300', 30000],
  ])('%s → %i cêntimos', (raw, cents) => expect(parseAmount(raw)).toBe(cents));

  it('rejeita lixo e aceita vários formatos de data', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseDate('31-01-2025')).toBe('2025-01-31');
    expect(parseDate('31/01/25')).toBe('2025-01-31');
    expect(parseDate('2025-01-31')).toBe('2025-01-31');
    expect(parseDate('20250131')).toBe('2025-01-31');
    expect(parseDate('31.01.2025')).toBe('2025-01-31');
    expect(parseDate('31-02-2025')).toBeNull();
  });
});

describe('extratos CSV', () => {
  it('lê formato com débito/crédito, separador ";" e linhas de preâmbulo', () => {
    const csv = [
      'Consulta de movimentos;;;;',
      'Conta;PT50 0000 0000 0000;;;',
      '',
      'Data Mov.;Data Valor;Descritivo;Débito;Crédito;Saldo',
      '02-01-2025;02-01-2025;"COMPRA ""LOJA"" PORTO";12,30;;987,70',
      '03-01-2025;03-01-2025;TRF RECEBIDA;;1.000,00;1.987,70',
    ].join('\r\n');
    const r = parseBankCsv('﻿' + csv);
    expect(r.rows).toEqual([
      { bookingDate: '2025-01-02', valueDate: '2025-01-02', description: 'COMPRA "LOJA" PORTO', amountCents: -1230, balanceCents: 98770, counterparty: undefined },
      { bookingDate: '2025-01-03', valueDate: '2025-01-03', description: 'TRF RECEBIDA', amountCents: 100000, balanceCents: 198770, counterparty: undefined },
    ]);
  });

  it('lê formato com montante único e separador ","', () => {
    const r = parseBankCsv('Date,Description,Amount\n2025-02-01,Coffee,-2.50\n2025-02-02,"Client, Ltd",150.00\nTotal,,147.50\n');
    expect(r.rows.map((x) => x.amountCents)).toEqual([-250, 15000]);
    expect(r.rows[1]!.description).toBe('Client, Ltd');
    expect(r.warnings).toHaveLength(1);
  });

  it('avisa quando não encontra colunas', () => {
    expect(parseBankCsv('a;b\n1;2').warnings[0]).toMatch(/colunas/);
  });
});

describe('extratos OFX', () => {
  it('lê movimentos SGML com FITID', () => {
    const ofx = `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>EUR<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20250115120000[0:GMT]<TRNAMT>-49.20<FITID>A1<NAME>MEO<MEMO>Fatura janeiro
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20250120<TRNAMT>1500.00<FITID>A2<NAME>CLIENTE SA
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const r = parseOfx(ofx);
    expect(r.rows).toEqual([
      { bookingDate: '2025-01-15', valueDate: undefined, description: 'MEO Fatura janeiro', amountCents: -4920, externalId: 'A1', counterparty: 'MEO', currency: 'EUR' },
      { bookingDate: '2025-01-20', valueDate: undefined, description: 'CLIENTE SA', amountCents: 150000, externalId: 'A2', counterparty: 'CLIENTE SA', currency: 'EUR' },
    ]);
  });
});

describe('normalização e impressões digitais', () => {
  it('normaliza e extrai a chave do comerciante', () => {
    expect(normalizeDescription('Compra  Café São João, Lda.')).toBe('COMPRA CAFE SAO JOAO LDA');
    expect(merchantKey('COMPRA 4521 GALP ENERGIA PORTO 12/03')).toBe('GALP ENERGIA');
    expect(merchantKey('DD MEO FATURA')).toBe('MEO');
  });

  it('movimentos idênticos no mesmo extrato têm impressões diferentes; reimportar dá as mesmas', () => {
    const t = { bookingDate: '2025-04-08', amountCents: -4920, description: 'DD MEO FATURA' };
    expect(transactionFingerprint(t, 1)).not.toBe(transactionFingerprint(t, 2));
    expect(transactionFingerprint(t, 1)).toBe(transactionFingerprint({ ...t, description: 'dd meo  fatura' }, 1));
  });
});

describe('regras de categorização', () => {
  const rules: RuleLike[] = [
    { matchField: 'description', matchType: 'regex', pattern: '\\bGALP\\b', direction: 'out', categoryId: 'combustivel', priority: 30, source: 'system' },
    { matchField: 'description', matchType: 'contains', pattern: 'galp energia', direction: 'out', categoryId: 'viagens', priority: 50, source: 'user' },
    { matchField: 'description', matchType: 'regex', pattern: '\\bREEMBOLSO\\b', direction: 'in', categoryId: 'reembolso', priority: 10, source: 'system' },
  ];

  it('as regras do utilizador têm precedência e respeitam a direção', () => {
    expect(categorize({ description: 'COMPRA GALP ENERGIA', amountCents: -5000 }, rules)).toMatchObject({ categoryId: 'viagens', confidence: 0.95 });
    expect(categorize({ description: 'COMPRA GALP LOJA 22', amountCents: -5000 }, rules)).toMatchObject({ categoryId: 'combustivel', confidence: 0.8 });
    expect(categorize({ description: 'REEMBOLSO IRS', amountCents: -100 }, rules)).toBeNull();
    expect(categorize({ description: 'REEMBOLSO IRS', amountCents: 100 }, rules)?.categoryId).toBe('reembolso');
  });

  it('"contains" compara palavras inteiras', () => {
    expect(categorize({ description: 'GALP ENERGIAS RENOVAVEIS', amountCents: -1 }, [rules[1]!])).toBeNull();
  });
});

describe('associação de justificativos', () => {
  const cands = [
    { id: 'a', bookingDate: '2025-05-03', amountCents: -6150, description: 'COMPRA SOFTDESIGN', duplicateOfId: null },
    { id: 'b', bookingDate: '2025-05-14', amountCents: -6150, description: 'COMPRA GALP COMBUSTIVEL', duplicateOfId: null },
  ];
  it('exige o mesmo montante e escolhe pela data e pelo nome', () => {
    expect(matchScore({ totalCents: 6100, documentDate: '2025-05-03' }, cands[0]!)).toBe(0);
    expect(bestMatch({ totalCents: 6150, documentDate: '2025-05-14', supplierName: 'Galp Energia, S.A.' }, cands)).toMatchObject({ transactionId: 'b', confident: true });
    expect(bestMatch({ totalCents: 6150, documentDate: '2025-05-03', supplierName: 'SoftDesign PT, Lda.' }, cands)).toMatchObject({ transactionId: 'a', confident: true });
  });

  it('não associa quando é ambíguo', () => {
    const twins = [cands[0]!, { ...cands[0]!, id: 'c' }];
    expect(bestMatch({ totalCents: 6150, documentDate: '2025-05-03' }, twins)?.confident).toBe(false);
  });
});

describe('cliente GoCardless Bank Account Data', () => {
  it('autentica, cria a requisição e converte movimentos', async () => {
    const calls: { url: string; method: string; body?: unknown; auth?: string }[] = [];
    const responses: Record<string, unknown> = {
      'POST /token/new/': { access: 'tok', access_expires: 86400 },
      'POST /agreements/enduser/': { id: 'agr1' },
      'POST /requisitions/': { id: 'req1', link: 'https://ob.gocardless.com/psd2/start/req1' },
      'GET /requisitions/req1/': { status: 'LN', accounts: ['acc1'] },
      'GET /accounts/acc1/transactions/?date_from=2025-01-01': {
        transactions: {
          booked: [
            { transactionId: 'x1', bookingDate: '2025-01-10', transactionAmount: { amount: '-49.20', currency: 'EUR' }, creditorName: 'MEO', remittanceInformationUnstructured: 'Fatura' },
            { internalTransactionId: 'x2', bookingDate: '2025-01-11', transactionAmount: { amount: '1500.00', currency: 'EUR' }, debtorName: 'CLIENTE SA' },
          ],
          pending: [],
        },
      },
    };
    const fakeFetch = (async (url: string, init: RequestInit) => {
      const path = url.replace('https://bankaccountdata.gocardless.com/api/v2', '');
      const key = `${init.method} ${path}`;
      calls.push({ url: path, method: init.method!, body: init.body ? JSON.parse(String(init.body)) : undefined, auth: (init.headers as Record<string, string>).authorization });
      if (!(key in responses)) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(responses[key]), { status: 200 });
    }) as unknown as typeof fetch;
    const gc = new GoCardlessAggregator({ secretId: 'id', secretKey: 'key' }, fakeFetch);
    const link = await gc.createLink({ institutionId: 'BANCO_PT', redirectUrl: 'https://app/cb', reference: 'conn1' });
    expect(link).toEqual({ externalRef: 'req1', link: 'https://ob.gocardless.com/psd2/start/req1' });
    expect(calls[0]!.body).toEqual({ secret_id: 'id', secret_key: 'key' });
    expect(calls[1]!.auth).toBe('Bearer tok');
    expect(calls[2]!.body).toMatchObject({ agreement: 'agr1', institution_id: 'BANCO_PT', reference: 'conn1' });
    expect(await gc.getLinkStatus('req1')).toEqual({ status: 'linked', accountIds: ['acc1'] });
    const txs = await gc.getTransactions('acc1', { dateFrom: '2025-01-01' });
    expect(txs).toEqual([
      { bookingDate: '2025-01-10', valueDate: undefined, amountCents: -4920, currency: 'EUR', description: 'MEO Fatura', counterparty: 'MEO', externalId: 'x1' },
      { bookingDate: '2025-01-11', valueDate: undefined, amountCents: 150000, currency: 'EUR', description: 'CLIENTE SA', counterparty: 'CLIENTE SA', externalId: 'x2' },
    ]);
    expect(calls.filter((c) => c.url === '/token/new/')).toHaveLength(1); // token reutilizado
    await expect(gc.getAccount('nope')).rejects.toThrow(/404/);
  });
});
