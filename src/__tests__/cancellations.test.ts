import { formatNotice, isLateCancellation, minutesBeforeClass, whoCancelled } from '../utils/cancellations';

const start = new Date('2026-09-28T18:00:00+02:00');

describe('whoCancelled', () => {
  it('distingue socio, admin y sistema', () => {
    expect(whoCancelled({ user_id: 'u1', cancelled_by: 'u1' })).toBe('self');
    expect(whoCancelled({ user_id: 'u1', cancelled_by: 'admin1' })).toBe('admin');
    expect(whoCancelled({ user_id: 'u1', cancelled_by: null })).toBe('system');
  });
});

describe('minutesBeforeClass / formatNotice', () => {
  it('cuenta la antelación', () => {
    expect(minutesBeforeClass('2026-09-28T17:35:00+02:00', start)).toBe(25);
    expect(formatNotice(25)).toBe('25 min antes');
    expect(formatNotice(180)).toBe('3 h antes');
    expect(formatNotice(60 * 50)).toBe('2 días antes');
    expect(formatNotice(-10)).toBe('con la clase empezada');
  });
});

describe('isLateCancellation', () => {
  const self = (at: string) => ({ user_id: 'u1', cancelled_by: 'u1', cancelled_at: at });

  it('última hora solo si se borró él, con menos minutos que el cierre de la cola', () => {
    // Cierre a 2 h (120 min): clase a las 18:00
    expect(isLateCancellation(self('2026-09-28T16:30:00+02:00'), start, 120)).toBe(true);
    expect(isLateCancellation(self('2026-09-28T15:00:00+02:00'), start, 120)).toBe(false);
    expect(isLateCancellation({ user_id: 'u1', cancelled_by: 'admin', cancelled_at: '2026-09-28T17:50:00+02:00' }, start, 120)).toBe(false);
  });

  it('con el cierre a 30 min, borrarse 90 min antes ya no es de última hora', () => {
    expect(isLateCancellation(self('2026-09-28T16:30:00+02:00'), start, 30)).toBe(false);
    expect(isLateCancellation(self('2026-09-28T17:45:00+02:00'), start, 30)).toBe(true);
  });

  it('con el cierre al empezar (0), solo cuenta borrarse con la clase ya empezada', () => {
    expect(isLateCancellation(self('2026-09-28T17:59:00+02:00'), start, 0)).toBe(false);
    expect(isLateCancellation(self('2026-09-28T18:05:00+02:00'), start, 0)).toBe(true);
  });

  it('sin indicar nada usa el valor por defecto (30 min)', () => {
    expect(isLateCancellation(self('2026-09-28T17:45:00+02:00'), start)).toBe(true);
    expect(isLateCancellation(self('2026-09-28T16:30:00+02:00'), start)).toBe(false);
  });
});
