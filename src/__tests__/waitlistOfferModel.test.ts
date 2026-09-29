import { offerClock, offerOptions, offerResultMessage, PendingOffer } from '../utils/waitlistOfferModel';

const base: PendingOffer = {
  id: 'o1',
  classId: 'c1',
  className: 'Funcional',
  classDate: '2026-10-01',
  classTime: '18:00:00',
  startsAt: new Date(2026, 8, 30, 12, 0, 0),
  expiresAt: new Date(2026, 8, 30, 12, 20, 0),
  otherClasses: [{ bookingId: 'b1', name: 'Funcional', time: '17:00:00' }],
  maxPerDay: 2,
};

describe('offerOptions', () => {
  it('ofrece cambiarse, quedarse con las dos y seguir como está', () => {
    expect(offerOptions(base).map((o) => o.action)).toEqual(['move', 'both', 'decline']);
    expect(offerOptions(base)[0]).toMatchObject({ bookingId: 'b1', label: 'Cambiarme desde la de las 17:00' });
  });

  it('sin "las dos" cuando ya está en el máximo diario', () => {
    const offer = {
      ...base,
      otherClasses: [
        { bookingId: 'b1', name: 'A', time: '09:00:00' },
        { bookingId: 'b2', name: 'B', time: '17:00:00' },
      ],
    };
    const opts = offerOptions(offer);
    expect(opts.map((o) => o.action)).toEqual(['move', 'move', 'decline']);
    expect(opts[1].bookingId).toBe('b2');
  });

  it('si ya no tiene otra clase ese día, solo entrar o no', () => {
    const opts = offerOptions({ ...base, otherClasses: [] });
    expect(opts.map((o) => o.action)).toEqual(['move', 'decline']);
    expect(opts[0].label).toBe('Entrar en la de las 18:00');
  });
});

describe('offerClock', () => {
  it('cuenta atrás en minutos:segundos', () => {
    const c = offerClock(base, new Date(2026, 8, 30, 12, 5, 30));
    expect(c).toEqual({ phase: 'running', label: '14:30', secondsLeft: 870 });
  });

  it('de noche: aún no cuenta', () => {
    const offer = { ...base, startsAt: new Date(2026, 9, 1, 8, 0, 0), expiresAt: new Date(2026, 9, 1, 8, 20, 0) };
    expect(offerClock(offer, new Date(2026, 9, 1, 1, 0, 0))).toEqual({
      phase: 'waiting',
      label: 'El tiempo empieza a contar a las 08:00',
    });
  });

  it('caducada', () => {
    expect(offerClock(base, new Date(2026, 8, 30, 12, 20, 0)).phase).toBe('expired');
  });
});

describe('offerResultMessage', () => {
  it('menciona la clase al entrar', () => {
    expect(offerResultMessage('move', base).message).toContain('Funcional a las 18:00');
  });
  it('resultado desconocido = error genérico', () => {
    expect(offerResultMessage('???', base).title).toBe('Error');
  });
});
