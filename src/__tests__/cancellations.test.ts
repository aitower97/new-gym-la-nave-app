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
  it('última hora solo si se borró él con menos de 2 h', () => {
    expect(isLateCancellation({ user_id: 'u1', cancelled_by: 'u1', cancelled_at: '2026-09-28T16:30:00+02:00' }, start)).toBe(true);
    expect(isLateCancellation({ user_id: 'u1', cancelled_by: 'u1', cancelled_at: '2026-09-28T15:00:00+02:00' }, start)).toBe(false);
    expect(isLateCancellation({ user_id: 'u1', cancelled_by: 'admin', cancelled_at: '2026-09-28T17:50:00+02:00' }, start)).toBe(false);
  });
});
