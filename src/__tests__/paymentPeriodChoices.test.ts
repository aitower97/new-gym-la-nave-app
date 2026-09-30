jest.mock('../lib/supabase', () => ({ supabase: {} }));

import { paymentPeriodChoices, periodShortLabel } from '../utils/planPayments';

describe('paymentPeriodChoices', () => {
  it('a mitad de mes no pregunta', () => {
    expect(paymentPeriodChoices('monthly', new Date(2026, 8, 15))).toBeNull();
  });

  it('del 24 al 30 de septiembre ofrece septiembre y octubre', () => {
    for (const day of [24, 27, 30]) {
      const c = paymentPeriodChoices('monthly', new Date(2026, 8, day, 18, 30));
      expect(c?.map((x) => x.label)).toEqual(['Septiembre', 'Octubre']);
      expect(c?.[1].date).toEqual(new Date(2026, 9, 1));
    }
  });

  it('el 23 aún no pregunta', () => {
    expect(paymentPeriodChoices('monthly', new Date(2026, 8, 23))).toBeNull();
  });

  it('diciembre pasa al año siguiente', () => {
    const c = paymentPeriodChoices('monthly', new Date(2026, 11, 28));
    expect(c?.[1].date).toEqual(new Date(2027, 0, 1));
    expect(c?.[1].label).toBe('Enero');
  });

  it('trimestral y anual', () => {
    expect(paymentPeriodChoices('quarterly', new Date(2026, 8, 28))?.map((x) => x.label)).toEqual(['Jul–sep', 'Oct–dic']);
    expect(paymentPeriodChoices('yearly', new Date(2026, 11, 26))?.map((x) => x.label)).toEqual(['2026', '2027']);
  });

  it('bonos y diario no tienen cuota', () => {
    expect(paymentPeriodChoices('once', new Date(2026, 8, 30))).toBeNull();
    expect(paymentPeriodChoices('daily', new Date(2026, 8, 30))).toBeNull();
  });
});

describe('periodShortLabel', () => {
  it('mes', () => {
    expect(periodShortLabel('monthly', new Date(2026, 9, 1))).toBe('Octubre');
  });
});
