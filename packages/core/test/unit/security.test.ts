import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  decryptBuffer,
  decryptString,
  encryptBuffer,
  encryptString,
  hashPassword,
  hotp,
  isCompanyNif,
  isIndividualNif,
  isValidNif,
  parseKeyring,
  totp,
  validatePasswordStrength,
  verifyPassword,
  verifyTotp,
} from '../../src';

const ring1 = parseKeyring('1=' + Buffer.alloc(32, 1).toString('base64'));
const ring2 = parseKeyring('1=' + Buffer.alloc(32, 1).toString('base64') + ',2=' + Buffer.alloc(32, 2).toString('base64'));

describe('TOTP/HOTP', () => {
  const secret = Buffer.from('12345678901234567890');

  it('reproduz os vetores de teste do RFC 4226 (anexo D)', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expected.forEach((code, counter) => expect(hotp(secret, counter)).toBe(code));
  });

  it('reproduz os vetores SHA1 do RFC 6238 (anexo B)', () => {
    const cases: [number, string][] = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
    ];
    for (const [t, code] of cases) expect(hotp(secret, Math.floor(t / 30), 8)).toBe(code);
  });

  it('codifica/descodifica base32 e aceita apenas ±1 passo, sem reutilização', () => {
    const b32 = base32Encode(secret);
    expect(b32).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(b32).equals(secret)).toBe(true);
    const now = 1_700_000_000_000;
    const code = totp(b32, now);
    const step = verifyTotp(b32, code, now);
    expect(step).not.toBeNull();
    expect(verifyTotp(b32, code, now + 30_000)).not.toBeNull();
    expect(verifyTotp(b32, code, now + 90_000)).toBeNull();
    expect(verifyTotp(b32, code, now, step)).toBeNull(); // replay
    expect(verifyTotp(b32, 'abc', now)).toBeNull();
  });
});

describe('encriptação AES-256-GCM', () => {
  it('encripta e desencripta texto, deteta adulteração e AAD errada', () => {
    const enc = encryptString('PT50 0002 0123 1234 5678 9015 4', ring1, 'iban');
    expect(enc).not.toContain('PT50');
    expect(decryptString(enc, ring1, 'iban')).toBe('PT50 0002 0123 1234 5678 9015 4');
    expect(() => decryptString(enc, ring1, 'outro')).toThrow();
    const parts = enc.split('.');
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith('A') ? 'BB' : 'AA');
    expect(() => decryptString(parts.join('.'), ring1, 'iban')).toThrow();
  });

  it('roda chaves: dados antigos continuam legíveis, novos usam a chave mais recente', () => {
    const old = encryptString('segredo', ring1);
    expect(decryptString(old, ring2)).toBe('segredo');
    expect(encryptString('novo', ring2).startsWith('v2.')).toBe(true);
  });

  it('encripta ficheiros binários', () => {
    const data = Buffer.from([0, 1, 2, 3, 255]);
    const blob = encryptBuffer(data, ring2);
    expect(decryptBuffer(blob, ring2).equals(data)).toBe(true);
    expect(() => parseKeyring('1=abc')).toThrow();
  });
});

describe('palavras-passe (scrypt)', () => {
  it('gera hash com sal e verifica', async () => {
    const h = await hashPassword('correto-cavalo-1');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correto-cavalo-1', h)).toBe(true);
    expect(await verifyPassword('errado-cavalo-1', h)).toBe(false);
    expect(await hashPassword('correto-cavalo-1')).not.toBe(h);
  });

  it('exige palavra-passe minimamente forte', () => {
    expect(validatePasswordStrength('curta1')).not.toBeNull();
    expect(validatePasswordStrength('sonumerosnao')).not.toBeNull();
    expect(validatePasswordStrength('boa-palavra-2025')).toBeNull();
  });
});

describe('NIF', () => {
  it('valida o dígito de controlo (módulo 11)', () => {
    expect(isValidNif('123456789')).toBe(true);
    expect(isValidNif('123456780')).toBe(false);
    expect(isValidNif('500000000')).toBe(true);
    expect(isValidNif('12345678')).toBe(false);
    expect(isValidNif('400000000')).toBe(false); // prefixo 4 só como 45
  });

  it('distingue pessoa singular de coletiva', () => {
    expect(isIndividualNif('123456789')).toBe(true);
    expect(isCompanyNif('123456789')).toBe(false);
    expect(isCompanyNif('500000000')).toBe(true);
  });
});
