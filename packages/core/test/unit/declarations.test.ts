import { describe, expect, it } from 'vitest';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { computeVatPeriod, parseTaxParams } from '@somar/tax-engine';
import p2025 from '@somar/tax-engine/params/2025.json';
import { buildSaftInvoicing, buildVatDeclaration } from '../../src';

const P = parseTaxParams(p2025);

describe('declaração periódica de IVA', () => {
  it('mapeia o apuramento para os campos do Quadro 06 e gera CSV/JSON', () => {
    const result = computeVatPeriod(
      {
        regime: 'normal_trimestral',
        period: { start: '2025-01-01', end: '2025-03-31' },
        operations: [
          { date: '2025-01-31', kind: 'output', netCents: 300000, vatCents: 69000, rateCode: 'normal' },
          { date: '2025-03-05', kind: 'input', netCents: 150000, vatCents: 34500, rateCode: 'normal', bucket: 'imobilizado' },
        ],
      },
      P,
    );
    const d = buildVatDeclaration({ nif: '234567899', periodLabel: '1.º trimestre 2025', periodicity: 'trimestral', result });
    const fields = Object.fromEntries(d.sections.flatMap((s) => s.fields).map((f) => [f.code, f.valueCents]));
    expect(fields).toMatchObject({ '3': 300000, '4': 69000, '20': 34500, '93': 34500, '96': 0 });
    expect(d.summary.at(-1)).toEqual({ label: 'IVA a pagar', valueCents: 34500, emphasis: true });
    const csv = d.files.find((f) => f.name.endsWith('.csv'))!.content;
    expect(csv.split('\n')[0]).toBe('Quadro;Campo;Descrição;Valor (EUR)');
    expect(csv).toContain(';4;IVA à taxa normal;690.00');
    expect(d.steps.some((s) => s.includes('26/05/2025'))).toBe(true);
  });
});

describe('SAF-T (PT) de faturação', () => {
  it('gera XML bem formado com totais e escapes', () => {
    const xml = buildSaftInvoicing({
      company: { nif: '234567899', name: 'Marta & Filhos', address: 'Rua <A>', postalCode: '4050-262', city: 'Porto' },
      period: { start: '2025-01-01', end: '2025-01-31' },
      invoices: [
        {
          number: 'FT 2025A/1', atcud: 'ABC-1', docType: 'FT', issueDate: '2025-01-31', status: 'issued', hash: 'h',
          customer: { id: 'c1', nif: '509123457', name: 'Atlântico "Software"', country: 'PT' },
          lines: [{ position: 1, description: 'Design', quantity: 1, unitPriceCents: 300000, netCents: 300000, vatRatePct: 23, vatRateCode: 'normal' }],
          netCents: 300000, vatCents: 69000, totalCents: 300000, withholdingCents: 69000,
        },
      ],
      software: { certificate: '0', producerNif: '999999990', name: 'Somar', version: '1' },
    });
    expect(XMLValidator.validate(xml)).toBe(true);
    const doc = new XMLParser().parse(xml);
    const si = doc.AuditFile.SourceDocuments.SalesInvoices;
    expect(si.NumberOfEntries).toBe(1);
    expect(si.TotalCredit).toBe(3000);
    expect(si.Invoice.DocumentTotals.GrossTotal).toBe(3690);
    expect(doc.AuditFile.Header.CompanyName).toBe('Marta & Filhos');
  });
});
