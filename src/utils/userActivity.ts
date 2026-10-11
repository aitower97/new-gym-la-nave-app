/**
 * Uso de clases de un socio, para la pantalla del admin "Clases del socio":
 * qué días y a qué hora gasta sus clases, y cómo entrena. Lógica pura (sin
 * red ni react-native) para poder testearla.
 *
 * Fechas siempre en hora local del móvil, que es la del gimnasio.
 */

export type ActivityStatus = 'done' | 'missed' | 'upcoming';

export interface ActivityClass {
  bookingId: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" */
  time: string;
  name: string;
  status: ActivityStatus;
}

/** Lunes primero: L M X J V S D */
export const WEEKDAY_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];

const pad2 = (n: number) => String(n).padStart(2, '0');
export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 0 = lunes … 6 = domingo */
export function weekdayIndex(date: string): number {
  return (parseDate(date).getDay() + 6) % 7;
}

/** Lunes de la semana de esa fecha, "YYYY-MM-DD". */
export function mondayOf(date: string): string {
  const d = parseDate(date);
  d.setDate(d.getDate() - weekdayIndex(date));
  return toDateStr(d);
}

/**
 * Reservada si la clase aún no ha empezado; si no, hecha salvo que el admin
 * marcara ✗ (attended === false). Sin marcar cuenta como que vino.
 */
export function classStatus(date: string, time: string, attended: boolean | null, now = new Date()): ActivityStatus {
  const [hh, mm] = time.split(':').map(Number);
  const start = parseDate(date);
  start.setHours(hh, mm, 0, 0);
  if (start > now) return 'upcoming';
  return attended === false ? 'missed' : 'done';
}

/** Clases desde `weeks` semanas atrás (lunes de esa semana) hasta hoy, sin las reservadas. */
export function pastWindow(items: ActivityClass[], weeks: number, now = new Date()): ActivityClass[] {
  const from = new Date(parseDate(mondayOf(toDateStr(now))));
  from.setDate(from.getDate() - (weeks - 1) * 7);
  const fromStr = toDateStr(from);
  return items.filter((c) => c.status !== 'upcoming' && c.date >= fromStr);
}

/** Clases a las que vino, por día de la semana (lunes primero). */
export function weekdayCounts(items: ActivityClass[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (const c of items) if (c.status === 'done') counts[weekdayIndex(c.date)]++;
  return counts;
}

/** Clases a las que vino, por hora de la clase, ordenadas por hora. */
export function hourCounts(items: ActivityClass[]): { time: string; count: number }[] {
  const map = new Map<string, number>();
  for (const c of items) if (c.status === 'done') map.set(c.time, (map.get(c.time) || 0) + 1);
  return [...map.entries()].map(([time, count]) => ({ time, count })).sort((a, b) => a.time.localeCompare(b.time));
}

/** Clases a las que vino en cada una de las últimas `weeks` semanas (la última es la actual). */
export function weeklyCounts(items: ActivityClass[], weeks: number, now = new Date()): { weekStart: string; count: number }[] {
  const result: { weekStart: string; count: number }[] = [];
  const monday = parseDate(mondayOf(toDateStr(now)));
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(monday);
    d.setDate(d.getDate() - i * 7);
    result.push({ weekStart: toDateStr(d), count: 0 });
  }
  const index = new Map(result.map((w, i) => [w.weekStart, i]));
  for (const c of items) {
    if (c.status !== 'done') continue;
    const i = index.get(mondayOf(c.date));
    if (i !== undefined) result[i].count++;
  }
  return result;
}

/** Porcentaje de clases pasadas a las que vino (null sin clases pasadas). */
export function attendanceRate(items: ActivityClass[]): number | null {
  let done = 0;
  let missed = 0;
  for (const c of items) {
    if (c.status === 'done') done++;
    else if (c.status === 'missed') missed++;
  }
  const total = done + missed;
  return total === 0 ? null : Math.round((done / total) * 100);
}

/**
 * Su horario habitual: todos los días que viene a menudo (los que llegan al
 * 60 % del día que más) y la hora más repetida. null si no hay clases hechas.
 * Sin tope de días: quien viene de lunes a viernes no debe salir como
 * "martes, miércoles y jueves".
 */
export function favoriteSlot(items: ActivityClass[]): { weekdays: number[]; time: string } | null {
  const days = weekdayCounts(items);
  const max = Math.max(...days);
  if (max === 0) return null;
  const weekdays = days
    .map((count, i) => ({ count, i }))
    .filter((d) => d.count >= max * 0.6)
    .map((d) => d.i);
  const hours = hourCounts(items);
  const top = hours.reduce((best, h) => (h.count > best.count ? h : best), hours[0]);
  return { weekdays, time: top.time };
}

/**
 * "lunes", "lunes y miércoles", "lunes, miércoles y viernes"; tres o más días
 * seguidos, como rango: "de lunes a viernes". Espera índices en orden.
 */
export function joinWeekdays(weekdays: number[]): string {
  const names = weekdays.map((i) => WEEKDAY_NAMES[i]);
  if (names.length <= 1) return names[0] ?? '';
  const consecutive = weekdays.every((d, i) => i === 0 || d === weekdays[i - 1] + 1);
  if (consecutive && names.length >= 3) return `de ${names[0]} a ${names[names.length - 1]}`;
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/** Días desde la última clase hecha (null si nunca vino). */
export function daysSinceLast(items: ActivityClass[], now = new Date()): number | null {
  const last = items.reduce<string | null>((acc, c) => (c.status === 'done' && (!acc || c.date > acc) ? c.date : acc), null);
  if (!last) return null;
  const today = parseDate(toDateStr(now));
  return Math.round((today.getTime() - parseDate(last).getTime()) / 86400000);
}
