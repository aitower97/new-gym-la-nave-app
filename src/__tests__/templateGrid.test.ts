import { buildTemplateGrid, dayOfWeek, FALLBACK_TIMES, normalizeTime } from '../utils/templateGrid';

describe('normalizeTime', () => {
  it('deja todo en HH:MM:SS', () => {
    expect(normalizeTime('11:00')).toBe('11:00:00');
    expect(normalizeTime('9:30')).toBe('09:30:00');
    expect(normalizeTime('18:00:00')).toBe('18:00:00');
  });
});

describe('dayOfWeek', () => {
  it('calcula el día sin desfase horario', () => {
    expect(dayOfWeek('2026-09-21')).toBe(1); // lunes
    expect(dayOfWeek('2026-09-27')).toBe(0); // domingo
  });
});

describe('buildTemplateGrid', () => {
  it('saca horas y días de las clases reales, incluidas las 11:00', () => {
    const grid = buildTemplateGrid(
      [
        { class_date: '2026-09-21', class_time: '18:00:00' },
        { class_date: '2026-09-22', class_time: '11:00:00' },
        { class_date: '2026-09-21', class_time: '07:00:00' },
      ],
      [],
    );
    expect(grid.times).toEqual(['07:00:00', '11:00:00', '18:00:00']);
    expect(grid.days).toEqual([1, 2]);
    expect(grid.withClasses.has('2-11:00:00')).toBe(true);
    expect(grid.withClasses.has('1-11:00:00')).toBe(false);
  });

  it('mantiene los huecos de la plantilla aunque ya no haya clase', () => {
    const grid = buildTemplateGrid(
      [{ class_date: '2026-09-21', class_time: '18:00:00' }],
      [{ day_of_week: 6, class_time: '10:00:00' }],
    );
    expect(grid.times).toEqual(['10:00:00', '18:00:00']);
    expect(grid.days).toEqual([1, 6]);
    expect(grid.withClasses.has('6-10:00:00')).toBe(false);
  });

  it('ordena el domingo al final', () => {
    const grid = buildTemplateGrid(
      [
        { class_date: '2026-09-27', class_time: '10:00' },
        { class_date: '2026-09-21', class_time: '10:00' },
      ],
      [],
    );
    expect(grid.days).toEqual([1, 0]);
  });

  it('sin clases ni plantilla usa el horario por defecto', () => {
    const grid = buildTemplateGrid([], []);
    expect(grid.times).toEqual(FALLBACK_TIMES);
    expect(grid.days).toEqual([1, 2, 3, 4, 5]);
  });
});
