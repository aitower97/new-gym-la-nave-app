import { parseWithDates, stringifyWithDates } from '../utils/jsonDates';

describe('JSON con fechas (caché del móvil)', () => {
  it('el cupo del menú vuelve con periodEnd como Date', () => {
    const end = new Date('2026-12-01T00:00:00.000Z');
    const cache: [string, unknown][] = [['menu:quota', { used: 3, total: 8, remaining: 5, periodEnd: end }]];

    const back = parseWithDates<[string, { periodEnd: Date }][]>(stringifyWithDates(cache));

    expect(back[0][1].periodEnd).toBeInstanceOf(Date);
    expect(back[0][1].periodEnd.getTime()).toBe(end.getTime());
  });

  it('los textos con forma de fecha siguen siendo texto', () => {
    const data = { class_date: '2026-11-24', created_at: '2026-11-24T09:15:32.240+00:00' };
    expect(parseWithDates(stringifyWithDates(data))).toEqual(data);
  });

  it('lee la caché guardada por 1.23.0 (fechas como texto) sin romper', () => {
    const viejo = JSON.stringify([['menu:quota', { periodEnd: new Date('2026-12-01T00:00:00.000Z') }]]);
    const back = parseWithDates<[string, { periodEnd: unknown }][]>(viejo);
    expect(typeof back[0][1].periodEnd).toBe('string');
  });
});
