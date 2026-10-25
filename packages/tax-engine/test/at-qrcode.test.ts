import { describe, expect, it } from 'vitest';
import { buildAtQrPayload, parseAtQrCode, qrNetCents, qrVatCents, validateAtQr } from '../src';

// Exemplo no formato das especificações técnicas da AT (Portaria 195/2020)
const SAMPLE =
  'A:123456789*B:999999990*C:PT*D:FS*E:N*F:20250314*G:FS CDVF/12345*H:CDF7T5HD-12345*I1:PT*I7:0.65*I8:0.15*N:0.15*O:0.80*Q:YhGV*R:9999';

describe('código QR da AT', () => {
  it('lê os campos de um talão', () => {
    const d = parseAtQrCode(SAMPLE)!;
    expect(d.issuerNif).toBe('123456789');
    expect(d.date).toBe('2025-03-14');
    expect(d.atcud).toBe('CDF7T5HD-12345');
    expect(d.region).toBe('continente');
    expect(d.totals.normal).toEqual({ baseCents: 65, vatCents: 15 });
    expect(d.totalCents).toBe(80);
    expect(validateAtQr(d)).toEqual([]);
  });

  it('suporta várias taxas e espaço fiscal da Madeira', () => {
    const d = parseAtQrCode('A:500000000*B:234567899*C:PT*D:FT*E:N*F:20251001*G:FT A/1*H:ABCD-1*K1:PT-MA*K3:10.00*K4:0.40*K7:100.00*K8:22.00*N:22.40*O:132.40*Q:abcd*R:1')!;
    expect(d.region).toBe('madeira');
    expect(qrNetCents(d)).toBe(11000);
    expect(qrVatCents(d)).toBe(2240);
    expect(validateAtQr(d)).toEqual([]);
  });

  it('deteta inconsistências e rejeita conteúdo inválido', () => {
    const d = parseAtQrCode(SAMPLE.replace('O:0.80', 'O:0.90'))!;
    expect(validateAtQr(d)).toHaveLength(1);
    expect(parseAtQrCode('isto não é um QR')).toBeNull();
    expect(parseAtQrCode(SAMPLE.replace('I7:0.65', 'I7:abc'))).toBeNull();
  });

  it('gera o conteúdo do QR de uma fatura emitida (ida e volta)', () => {
    const d = parseAtQrCode(SAMPLE)!;
    expect(parseAtQrCode(buildAtQrPayload(d))).toEqual(d);
  });
});
