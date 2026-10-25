import { describe, expect, it } from 'vitest';
import { buildObligationCalendar } from '../src';
import { resolve } from './helpers';

const range2025 = { from: '2025-01-01', to: '2025-12-31' };

describe('calendário de obrigações', () => {
  it('ENI com IVA trimestral (caso de referência): datas de 2025', () => {
    const cal = buildObligationCalendar(
      { legalForm: 'eni', vatRegime: 'normal_trimestral', incomeTaxRegime: 'irs_simplificado', activityStartDate: '2022-09-01', invoicesAutoCommunicated: true },
      range2025,
      resolve,
    );
    const dates = (type: string) => cal.filter((o) => o.type === type).map((o) => o.dueDate);
    expect(dates('iva_declaracao_periodica')).toEqual(['2025-02-20', '2025-05-20', '2025-08-20', '2025-11-20']);
    expect(dates('iva_pagamento')).toEqual(['2025-02-25', '2025-05-26', '2025-08-25', '2025-11-25']);
    expect(dates('ss_declaracao_trimestral')).toEqual(['2025-01-31', '2025-04-30', '2025-07-31', '2025-10-31']);
    expect(dates('ss_pagamento_contribuicoes')).toEqual([
      '2025-01-20', '2025-02-20', '2025-03-20', '2025-04-21', '2025-05-20', '2025-06-20',
      '2025-07-21', '2025-08-20', '2025-09-22', '2025-10-20', '2025-11-20', '2025-12-22',
    ]);
    const irs = cal.find((o) => o.type === 'irs_modelo3')!;
    expect(irs).toMatchObject({ periodLabel: '2024', windowStart: '2025-04-01', dueDate: '2025-06-30' });
    expect(dates('efatura_comunicacao')).toHaveLength(12);
    expect(cal.find((o) => o.type === 'efatura_comunicacao' && o.periodLabel === 'setembro 2025')?.dueDate).toBe('2025-10-06');
    expect(cal.filter((o) => o.type.startsWith('irc'))).toHaveLength(0);
    expect(cal).toHaveLength(37);
    expect(cal.every((o) => o.legalRef.length > 0)).toBe(true);
  });

  it('sociedade com IVA mensal e trabalhadores', () => {
    const cal = buildObligationCalendar(
      { legalForm: 'lda', vatRegime: 'normal_mensal', incomeTaxRegime: 'irc_geral', activityStartDate: '2020-05-01', hasEmployees: true },
      range2025,
      resolve,
    );
    const dates = (type: string) => cal.filter((o) => o.type === type).map((o) => o.dueDate);
    expect(dates('iva_declaracao_periodica')).toHaveLength(12);
    expect(dates('iva_declaracao_periodica')[0]).toBe('2025-01-20'); // novembro de 2024
    expect(dates('irc_modelo22')).toEqual(['2025-06-02']); // 31/05/2025 é sábado
    expect(dates('ies')).toEqual(['2025-07-15']);
    expect(dates('irc_pagamento_por_conta')).toEqual(['2025-07-31', '2025-09-30', '2025-12-15']);
    expect(dates('dmr_retencoes')).toHaveLength(12);
    expect(cal.filter((o) => o.type.startsWith('ss_'))).toEqual(cal.filter((o) => o.type === 'ss_declaracao_remuneracoes'));
  });

  it('início de atividade em junho de 2025: sem Segurança Social em 2025 e IVA só a partir do período de início', () => {
    const cal = buildObligationCalendar(
      { legalForm: 'trabalhador_independente', vatRegime: 'normal_trimestral', incomeTaxRegime: 'irs_simplificado', activityStartDate: '2025-06-15' },
      { from: '2025-01-01', to: '2026-12-31' },
      resolve,
    );
    expect(cal.filter((o) => o.type === 'iva_declaracao_periodica').map((o) => o.periodLabel)[0]).toBe('2.º trimestre 2025');
    const ss = cal.filter((o) => o.type === 'ss_pagamento_contribuicoes');
    expect(ss[0]!.periodLabel).toBe('junho 2026');
    expect(cal.filter((o) => o.type === 'ss_declaracao_trimestral')[0]!.periodLabel).toBe('1.º trimestre 2026');
    expect(cal.find((o) => o.type === 'irs_modelo3')!.periodLabel).toBe('2025');
  });

  it('isento do art. 53.º: sem declarações periódicas de IVA', () => {
    const cal = buildObligationCalendar(
      { legalForm: 'trabalhador_independente', vatRegime: 'isento_art53', incomeTaxRegime: 'irs_simplificado', activityStartDate: '2020-01-01' },
      range2025,
      resolve,
    );
    expect(cal.some((o) => o.type.startsWith('iva'))).toBe(false);
  });
});
