import { describe, expect, it } from 'vitest';
import { paramsToVerify, safeParseTaxParams } from '../src';
import p2025 from '../params/2025.json';
import { params2025, params2026, resolve } from './helpers';

describe('parâmetros fiscais', () => {
  it('os ficheiros de 2025 e 2026 são válidos', () => {
    expect(params2025.year).toBe(2025);
    expect(params2026.year).toBe(2026);
  });

  it('rejeita escalões não crescentes ou sem escalão final aberto', () => {
    const bad = structuredClone(p2025);
    bad.irs.brackets[2]!.upToCents = 100;
    expect(safeParseTaxParams(bad).success).toBe(false);
    const bad2 = structuredClone(p2025);
    bad2.irs.brackets.at(-1)!.upToCents = 999999999 as unknown as null;
    expect(safeParseTaxParams(bad2).success).toBe(false);
  });

  it('sinaliza os valores a confirmar nas fontes oficiais', () => {
    const keys = paramsToVerify(params2026).map((p) => p.key);
    expect(keys).toContain('irs.brackets');
    expect(keys).toContain('socialSecurity.iasCents');
  });

  it('o resolvedor usa o ano mais próximo quando falta o ano pedido', () => {
    expect(resolve(2024).year).toBe(2025);
    expect(resolve(2030).year).toBe(2026);
  });
});
