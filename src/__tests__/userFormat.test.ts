import { formatBirthDateWithAge } from '../utils/user';

describe('formatBirthDateWithAge', () => {
  const now = new Date(2026, 8, 27); // 27/09/2026

  it('fecha en formato español y edad', () => {
    expect(formatBirthDateWithAge('1990-01-31', now)).toBe('31/01/1990 · 36 años');
  });

  it('aún no ha cumplido este año', () => {
    expect(formatBirthDateWithAge('1990-09-28', now)).toBe('28/09/1990 · 35 años');
  });

  it('cumple hoy', () => {
    expect(formatBirthDateWithAge('1990-09-27', now)).toBe('27/09/1990 · 36 años');
  });

  it('sin fecha', () => {
    expect(formatBirthDateWithAge(null, now)).toBe('No proporcionada');
  });
});
