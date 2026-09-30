import { moveClassLine, moveOptions, moveResultMessage, PendingMove } from '../utils/waitlistMoveModel';

const base: PendingMove = {
  id: 'm1',
  toClassName: 'Cross Training',
  toClassDate: '2026-10-01',
  toClassTime: '18:00:00',
  fromClassTime: '17:00:00',
  sameDayCount: 1,
  maxPerDay: 2,
};

describe('moveOptions', () => {
  it('mantener, volver y las dos si le caben', () => {
    expect(moveOptions(base).map((o) => o.action)).toEqual(['keep', 'back', 'both']);
    expect(moveOptions(base)[1].label).toBe('Volver a las 17:00');
  });

  it('sin "las dos" si ya está en el máximo diario', () => {
    expect(moveOptions({ ...base, sameDayCount: 2 }).map((o) => o.action)).toEqual(['keep', 'back']);
  });
});

describe('moveClassLine', () => {
  it('día y hora', () => {
    expect(moveClassLine(base)).toMatch(/^Jueves 1 oct · 18:00$/);
  });
});

describe('moveResultMessage', () => {
  it('mantener no necesita aviso', () => {
    expect(moveResultMessage('kept', base)).toBeNull();
  });
  it('sin plaza para volver', () => {
    expect(moveResultMessage('full', base)?.message).toBe('La de las 17:00 ya está completa.');
  });
});
