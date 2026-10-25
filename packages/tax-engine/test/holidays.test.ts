import { describe, expect, it } from 'vitest';
import { adjustDeadline, easterSunday, isBusinessDay, nationalHolidays } from '../src';

describe('feriados e prazos', () => {
  it('calcula a Páscoa e os feriados móveis', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    const h = nationalHolidays(2025);
    expect(h.get('2025-04-18')).toBe('Sexta-feira Santa');
    expect(h.get('2025-06-19')).toBe('Corpo de Deus');
    expect(h.size).toBe(13);
  });

  it('transfere prazos de fim de semana/feriado para o dia útil seguinte (art. 20.º CPPT)', () => {
    expect(adjustDeadline('2025-05-25')).toBe('2025-05-26'); // domingo
    expect(adjustDeadline('2025-04-20')).toBe('2025-04-21'); // domingo de Páscoa
    expect(adjustDeadline('2025-10-05')).toBe('2025-10-06'); // domingo e feriado
    expect(adjustDeadline('2025-12-20')).toBe('2025-12-22'); // sábado
    expect(adjustDeadline('2025-12-24')).toBe('2025-12-24');
    expect(adjustDeadline('2025-12-25')).toBe('2025-12-26');
    expect(isBusinessDay('2025-06-10')).toBe(false);
  });
});
