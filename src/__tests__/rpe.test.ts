import { formatRpe, parseRpe, rpeForEstimate } from '../utils/rpe';

describe('parseRpe', () => {
  it('vacío = sin RPE', () => {
    expect(parseRpe('')).toBeUndefined();
    expect(parseRpe('  ')).toBeUndefined();
    expect(parseRpe(null)).toBeUndefined();
  });

  it('enteros y medios, con coma o punto', () => {
    expect(parseRpe('8')).toEqual({ min: 8, max: null });
    expect(parseRpe('7,5')).toEqual({ min: 7.5, max: null });
    expect(parseRpe('8.5')).toEqual({ min: 8.5, max: null });
    expect(parseRpe('10')).toEqual({ min: 10, max: null });
  });

  it('rangos con / o -', () => {
    expect(parseRpe('7/8')).toEqual({ min: 7, max: 8 });
    expect(parseRpe('7 - 8')).toEqual({ min: 7, max: 8 });
    expect(parseRpe('7,5/8,5')).toEqual({ min: 7.5, max: 8.5 });
    expect(parseRpe('8/7')).toEqual({ min: 7, max: 8 }); // al revés, se ordena
    expect(parseRpe('8/8')).toEqual({ min: 8, max: null });
  });

  it('rechaza lo que no es un RPE', () => {
    expect(parseRpe('7,3')).toBeNull();
    expect(parseRpe('11')).toBeNull();
    expect(parseRpe('0')).toBeNull();
    expect(parseRpe('abc')).toBeNull();
    expect(parseRpe('7/8/9')).toBeNull();
    expect(parseRpe('7/')).toBeNull();
  });
});

describe('formatRpe', () => {
  it('muestra como se escribe', () => {
    expect(formatRpe(8)).toBe('8');
    expect(formatRpe(7.5)).toBe('7,5');
    expect(formatRpe(7, 8)).toBe('7/8');
    expect(formatRpe('7.5', '8.5')).toBe('7,5/8,5');
    expect(formatRpe(null)).toBe('');
    expect(formatRpe(8, null)).toBe('8');
  });

  it('ida y vuelta', () => {
    for (const t of ['8', '7,5', '7/8', '7,5/8,5']) {
      const v = parseRpe(t)!;
      expect(formatRpe(v.min, v.max)).toBe(t);
    }
  });
});

describe('rpeForEstimate', () => {
  it('rango = punto medio', () => {
    expect(rpeForEstimate(7, 8)).toBe(7.5);
    expect(rpeForEstimate(8)).toBe(8);
    expect(rpeForEstimate('7.5', null)).toBe(7.5);
    expect(rpeForEstimate(null)).toBeNull();
  });
});
