import {
  DEFAULT_WAITLIST_CUTOFF_MINUTES,
  WAITLIST_CUTOFF_PRESETS,
  formatWaitlistCutoff,
  parseWaitlistCutoff,
  waitlistCutoffOptions,
} from '../utils/waitlistCutoff';

describe('parseWaitlistCutoff', () => {
  it('lee minutos enteros, incluido 0', () => {
    expect(parseWaitlistCutoff('30')).toBe(30);
    expect(parseWaitlistCutoff('0')).toBe(0);
    expect(parseWaitlistCutoff(' 120 ')).toBe(120);
  });

  it('cualquier otra cosa devuelve el valor por defecto', () => {
    expect(parseWaitlistCutoff(null)).toBe(DEFAULT_WAITLIST_CUTOFF_MINUTES);
    expect(parseWaitlistCutoff(undefined)).toBe(DEFAULT_WAITLIST_CUTOFF_MINUTES);
    expect(parseWaitlistCutoff('')).toBe(DEFAULT_WAITLIST_CUTOFF_MINUTES);
    expect(parseWaitlistCutoff('-5')).toBe(DEFAULT_WAITLIST_CUTOFF_MINUTES);
    expect(parseWaitlistCutoff('1.5')).toBe(DEFAULT_WAITLIST_CUTOFF_MINUTES);
    expect(parseWaitlistCutoff('dos horas')).toBe(DEFAULT_WAITLIST_CUTOFF_MINUTES);
  });

  it('el valor por defecto es una de las opciones del panel', () => {
    expect(WAITLIST_CUTOFF_PRESETS).toContain(DEFAULT_WAITLIST_CUTOFF_MINUTES);
  });
});

describe('waitlistCutoffOptions', () => {
  it('un valor de la lista no añade nada', () => {
    expect(waitlistCutoffOptions(60)).toEqual(WAITLIST_CUTOFF_PRESETS);
  });

  it('un valor puesto a mano en la base aparece, ordenado', () => {
    expect(waitlistCutoffOptions(45)).toEqual([0, 15, 30, 45, 60, 120]);
    expect(waitlistCutoffOptions(180)).toEqual([0, 15, 30, 60, 120, 180]);
  });
});

describe('formatWaitlistCutoff', () => {
  it('textos cortos', () => {
    expect(formatWaitlistCutoff(0)).toBe('Al empezar');
    expect(formatWaitlistCutoff(15)).toBe('15 min');
    expect(formatWaitlistCutoff(60)).toBe('1 h');
    expect(formatWaitlistCutoff(90)).toBe('1 h 30 min');
    expect(formatWaitlistCutoff(120)).toBe('2 h');
  });
});
