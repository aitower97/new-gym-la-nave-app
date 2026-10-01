jest.mock('../lib/supabase', () => ({ supabase: {} }));

import { classHasStarted, nextAttendance } from '../utils/attendance';

describe('nextAttendance', () => {
  it('marca lo pulsado si no estaba marcado', () => {
    expect(nextAttendance(null, true)).toBe(true);
    expect(nextAttendance(null, false)).toBe(false);
  });
  it('cambia de ✓ a ✗ y al revés', () => {
    expect(nextAttendance(true, false)).toBe(false);
    expect(nextAttendance(false, true)).toBe(true);
  });
  it('pulsar lo ya marcado lo desmarca', () => {
    expect(nextAttendance(true, true)).toBeNull();
    expect(nextAttendance(false, false)).toBeNull();
  });
});

describe('classHasStarted', () => {
  const now = new Date(2026, 9, 1, 18, 0);
  it('antes de la hora, no', () => {
    expect(classHasStarted('2026-10-01', '18:30:00', now)).toBe(false);
    expect(classHasStarted('2026-10-02', '07:00:00', now)).toBe(false);
  });
  it('a la hora en punto y después, sí', () => {
    expect(classHasStarted('2026-10-01', '18:00:00', now)).toBe(true);
    expect(classHasStarted('2026-09-30', '20:00', now)).toBe(true);
  });
});
