import { effectivePeriod, effectiveSlotCount, maxPeriodSlotCount, parseDmy, periodKey, periodLabel, sortPeriods, upcomingWeeks } from '../utils/templatePeriods';

const siempre = { from: null, until: null };
const semana = { from: '2026-10-06', until: '2026-10-12' };
const desde20 = { from: '2026-10-20', until: null };

describe('effectivePeriod', () => {
  const all = [siempre, semana, desde20];

  it('fuera de las fechadas manda "Siempre"', () => {
    expect(effectivePeriod(all, '2026-10-02')).toBe(siempre);
  });

  it('una semana suelta tapa a "Siempre" solo esa semana', () => {
    expect(effectivePeriod(all, '2026-10-06')).toBe(semana);
    expect(effectivePeriod(all, '2026-10-12')).toBe(semana);
    expect(effectivePeriod(all, '2026-10-13')).toBe(siempre);
  });

  it('"Desde" sustituye a partir de ese día', () => {
    expect(effectivePeriod(all, '2026-10-19')).toBe(siempre);
    expect(effectivePeriod(all, '2026-10-20')).toBe(desde20);
    expect(effectivePeriod(all, '2027-03-01')).toBe(desde20);
  });

  it('una semana dentro de un "Desde" también lo tapa', () => {
    const semanaNov = { from: '2026-11-02', until: '2026-11-08' };
    expect(effectivePeriod([siempre, desde20, semanaNov], '2026-11-04')).toBe(semanaNov);
  });

  it('sin "Siempre", los días sin plantilla no tienen ninguna', () => {
    expect(effectivePeriod([semana], '2026-10-20')).toBeNull();
  });

  it('empate de inicio: la más corta', () => {
    const corta = { from: '2026-10-06', until: '2026-10-08' };
    expect(effectivePeriod([semana, corta], '2026-10-07')).toBe(corta);
    expect(effectivePeriod([semana, corta], '2026-10-10')).toBe(semana);
  });
});

describe('etiquetas y utilidades', () => {
  it('periodLabel', () => {
    expect(periodLabel(siempre)).toBe('Siempre');
    expect(periodLabel(semana)).toBe('6–12 oct');
    expect(periodLabel(desde20)).toBe('Desde 20 oct');
    expect(periodLabel({ from: '2026-09-28', until: '2026-10-04' })).toBe('28 sep–4 oct');
    expect(periodLabel({ from: null, until: '2026-10-12' })).toBe('Hasta 12 oct');
  });

  it('sortPeriods: "Siempre" primero', () => {
    expect(sortPeriods([desde20, semana, siempre]).map(periodKey)).toEqual([periodKey(siempre), periodKey(semana), periodKey(desde20)]);
  });

  it('upcomingWeeks: de lunes a domingo desde la semana actual', () => {
    const w = upcomingWeeks(new Date(2026, 8, 30), 2); // miércoles 30 sep
    expect(w).toEqual([
      { from: '2026-09-28', until: '2026-10-04' },
      { from: '2026-10-05', until: '2026-10-11' },
    ]);
  });

  it('parseDmy', () => {
    expect(parseDmy('20/10/2026')).toBe('2026-10-20');
    expect(parseDmy('5/1/2027')).toBe('2027-01-05');
    expect(parseDmy('31/02/2026')).toBeNull();
    expect(parseDmy('2026-10-20')).toBeNull();
  });
});

describe('recuentos por plantilla', () => {
  const rows = [
    { valid_from: null, valid_until: null, class_type: 'CROSS' },
    { valid_from: null, valid_until: null, class_type: 'CROSS' },
    { valid_from: null, valid_until: null, class_type: 'CROSS' },
    // Semana de vacaciones: fila marcadora sin clase
    { valid_from: '2026-10-06', valid_until: '2026-10-12', class_type: '' },
  ];

  it('cuenta la plantilla que manda ese día', () => {
    expect(effectiveSlotCount(rows, '2026-10-01')).toBe(3);
  });

  it('la semana de vacaciones manda y no tiene clases', () => {
    expect(effectiveSlotCount(rows, '2026-10-08')).toBe(0);
  });

  it('la más cargada, sin contar marcadores', () => {
    expect(maxPeriodSlotCount(rows)).toBe(3);
  });
});
