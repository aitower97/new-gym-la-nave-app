import { describeTrigger, filterInactive, validateOffset } from '../utils/notificationRules';

describe('describeTrigger', () => {
  it('explica cada regla en lenguaje llano', () => {
    expect(describeTrigger('inactivity', 15)).toBe('Tras 15 días sin venir a clase');
    expect(describeTrigger('quota_low', 2)).toBe('Cuando le quedan 2 clases o menos');
    expect(describeTrigger('bono_expiring', 3)).toBe('3 días antes de que caduque su bono');
  });

  it('usa singular con 1', () => {
    expect(describeTrigger('inactivity', 1)).toBe('Tras 1 día sin venir a clase');
    expect(describeTrigger('quota_low', 1)).toBe('Cuando le queda 1 clase o ninguna');
  });

  it('cumpleaños con 0 días es el mismo día', () => {
    expect(describeTrigger('birthday', 0)).toBe('El día de su cumpleaños');
    expect(describeTrigger('birthday', 2)).toBe('2 días antes de su cumpleaños');
  });

  it('las reglas sin número no lo mencionan', () => {
    expect(describeTrigger('payment_due', null)).not.toMatch(/\d/);
  });
});

describe('validateOffset', () => {
  it('rechaza vacío, decimales y texto', () => {
    expect(validateOffset('inactivity', '')).not.toBeNull();
    expect(validateOffset('inactivity', '1.5')).not.toBeNull();
    expect(validateOffset('inactivity', 'abc')).not.toBeNull();
  });

  it('exige > 0 salvo en cumpleaños, que admite 0', () => {
    expect(validateOffset('inactivity', '0')).not.toBeNull();
    expect(validateOffset('inactivity', '15')).toBeNull();
    expect(validateOffset('birthday', '0')).toBeNull();
    expect(validateOffset('birthday', '-1')).not.toBeNull();
  });

  it('el día de bloqueo por impago cabe en cualquier mes', () => {
    expect(validateOffset('payment_blocked', '28')).toBeNull();
    expect(validateOffset('payment_blocked', '31')).not.toBeNull();
  });
});

describe('filterInactive', () => {
  const now = new Date('2026-09-25T12:00:00Z').getTime();
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

  it('usa la última asistencia si la hay', () => {
    const users = [
      { id: 'a', plan_assigned_at: null, created_at: daysAgo(400) },
      { id: 'b', plan_assigned_at: null, created_at: daysAgo(400) },
    ];
    const last = new Map([['a', daysAgo(20)], ['b', daysAgo(5)]]);
    expect(filterInactive(users, last, 15, now)).toEqual(['a']);
  });

  it('si nunca ha venido cuenta desde el plan, y si no desde el alta', () => {
    const users = [
      { id: 'plan-reciente', plan_assigned_at: daysAgo(3), created_at: daysAgo(400) },
      { id: 'alta-antigua', plan_assigned_at: null, created_at: daysAgo(40) },
      { id: 'alta-reciente', plan_assigned_at: null, created_at: daysAgo(2) },
    ];
    expect(filterInactive(users, new Map(), 15, now)).toEqual(['alta-antigua']);
  });
});
