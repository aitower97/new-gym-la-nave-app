import {
  ActivityClass,
  attendanceRate,
  classStatus,
  daysSinceLast,
  favoriteSlot,
  hourCounts,
  joinWeekdays,
  mondayOf,
  pastWindow,
  weekdayCounts,
  weekdayIndex,
  weeklyCounts,
} from '../utils/userActivity';

// Sábado 11 oct 2026, 12:00
const now = new Date(2026, 9, 11, 12, 0);

const c = (date: string, time: string, status: ActivityClass['status'] = 'done'): ActivityClass => ({
  bookingId: `${date}-${time}`, date, time, name: 'CrossFit', status,
});

describe('fechas', () => {
  it('lunes = 0, domingo = 6', () => {
    expect(weekdayIndex('2026-10-05')).toBe(0);
    expect(weekdayIndex('2026-10-11')).toBe(6);
  });
  it('lunes de la semana', () => {
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(mondayOf('2026-10-01')).toBe('2026-09-28');
  });
});

describe('classStatus', () => {
  it('reservada si aún no ha empezado', () => {
    expect(classStatus('2026-10-11', '18:00', null, now)).toBe('upcoming');
    expect(classStatus('2026-10-12', '07:00', null, now)).toBe('upcoming');
  });
  it('hecha si empezó y no se marcó ✗; sin marcar cuenta como que vino', () => {
    expect(classStatus('2026-10-11', '09:00', null, now)).toBe('done');
    expect(classStatus('2026-10-10', '18:00', true, now)).toBe('done');
  });
  it('no vino si el admin marcó ✗', () => {
    expect(classStatus('2026-10-10', '18:00', false, now)).toBe('missed');
  });
});

describe('estadísticas', () => {
  const items = [
    c('2026-10-05', '18:00'), // lunes
    c('2026-10-07', '18:00'), // miércoles
    c('2026-09-28', '18:00'), // lunes
    c('2026-09-30', '07:00'), // miércoles
    c('2026-10-02', '18:00', 'missed'), // viernes, no vino
    c('2026-10-13', '18:00', 'upcoming'), // martes que viene
  ];

  it('días de la semana: solo las hechas', () => {
    expect(weekdayCounts(items)).toEqual([2, 0, 2, 0, 0, 0, 0]);
  });
  it('horas ordenadas, solo las hechas', () => {
    expect(hourCounts(items)).toEqual([{ time: '07:00', count: 1 }, { time: '18:00', count: 3 }]);
  });
  it('asistencia: hechas / (hechas + no vino)', () => {
    expect(attendanceRate(items)).toBe(80);
    expect(attendanceRate([c('2026-10-13', '18:00', 'upcoming')])).toBeNull();
  });
  it('semanas: la última es la actual', () => {
    const w = weeklyCounts(items, 3, now);
    expect(w).toEqual([
      { weekStart: '2026-09-21', count: 0 },
      { weekStart: '2026-09-28', count: 2 },
      { weekStart: '2026-10-05', count: 2 },
    ]);
  });
  it('horario habitual', () => {
    expect(favoriteSlot(items)).toEqual({ weekdays: [0, 2], time: '18:00' });
    expect(favoriteSlot([])).toBeNull();
  });
  it('quien viene de lunes a viernes no se queda en 3 días (caso real)', () => {
    // 8, 11, 10, 11, 10 clases de lunes a viernes, casi todas a las 10:00
    const perDay = [8, 11, 10, 11, 10];
    const real: ActivityClass[] = [];
    perDay.forEach((n, i) => {
      for (let k = 0; k < n; k++) {
        const d = new Date(2026, 6, 6 + i + k * 7); // semanas desde el lunes 6 jul
        real.push(c(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, '10:00'));
      }
    });
    const fav = favoriteSlot(real)!;
    expect(fav).toEqual({ weekdays: [0, 1, 2, 3, 4], time: '10:00' });
    expect(joinWeekdays(fav.weekdays)).toBe('de lunes a viernes');
  });
  it('ventana: sin reservadas ni clases anteriores', () => {
    const w = pastWindow([...items, c('2026-08-03', '18:00')], 2, now);
    expect(w.map((x) => x.date).sort()).toEqual(['2026-09-28', '2026-09-30', '2026-10-02', '2026-10-05', '2026-10-07']);
  });
  it('días desde la última clase hecha', () => {
    expect(daysSinceLast(items, now)).toBe(4);
    expect(daysSinceLast([], now)).toBeNull();
  });
});

describe('joinWeekdays', () => {
  it('une en castellano', () => {
    expect(joinWeekdays([0])).toBe('lunes');
    expect(joinWeekdays([0, 2])).toBe('lunes y miércoles');
    expect(joinWeekdays([0, 2, 4])).toBe('lunes, miércoles y viernes');
    expect(joinWeekdays([1, 2, 3])).toBe('de martes a jueves');
    expect(joinWeekdays([0, 1])).toBe('lunes y martes');
  });
});
