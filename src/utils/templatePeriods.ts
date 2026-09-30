/**
 * templatePeriods.ts — Plantillas con fechas (lógica pura, sin Supabase).
 *
 * Un socio puede tener varias plantillas; cada una son las filas de
 * booking_templates con el mismo (valid_from, valid_until). Sin fechas =
 * "Siempre". Para un día concreto manda la plantilla que EMPIEZA MÁS TARDE de
 * las que lo cubren (en empate, la que acaba antes): así una semana suelta
 * tapa a "Siempre" solo esa semana, y una "Desde el 20" la sustituye a partir
 * de ese día sin tener que cerrar la anterior.
 *
 * La misma regla está duplicada en supabase/functions/smart-action (Deno no
 * puede importar de la app): si cambia aquí, cámbiala allí.
 */

export interface TemplatePeriod {
  /** "YYYY-MM-DD" o null (sin inicio) */
  from: string | null;
  /** "YYYY-MM-DD" o null (sin fin) */
  until: string | null;
}

export const periodKey = (p: TemplatePeriod) => `${p.from ?? ''}|${p.until ?? ''}`;

/**
 * Una plantilla con fechas y SIN clases (p. ej. una semana de vacaciones) se
 * guarda con una única fila marcadora de tipo vacío: así existe, tapa a
 * "Siempre" esos días y no coincide con ninguna clase real.
 */
export const EMPTY_PERIOD_MARKER = { day_of_week: 0, class_time: '00:00:00', class_type: '' } as const;

export function periodFromKey(key: string): TemplatePeriod {
  const [from, until] = key.split('|');
  return { from: from || null, until: until || null };
}

export function periodCovers(p: TemplatePeriod, dateStr: string): boolean {
  return (!p.from || p.from <= dateStr) && (!p.until || dateStr <= p.until);
}

/** La plantilla que manda ese día, o null si ninguna lo cubre. */
export function effectivePeriod<T extends TemplatePeriod>(periods: T[], dateStr: string): T | null {
  let best: T | null = null;
  for (const p of periods) {
    if (!periodCovers(p, dateStr)) continue;
    if (!best) { best = p; continue; }
    const pf = p.from ?? '', bf = best.from ?? '';
    if (pf > bf) { best = p; continue; }
    if (pf === bf) {
      // Empate de inicio: la más corta (un fin antes que "sin fin")
      const pu = p.until ?? '9999-12-31', bu = best.until ?? '9999-12-31';
      if (pu < bu) best = p;
    }
  }
  return best;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const short = (s: string) => {
  const [, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

/** "Siempre" · "Desde 20 oct" · "Hasta 12 oct" · "6–12 oct" · "28 sep–4 oct" */
export function periodLabel(p: TemplatePeriod): string {
  if (!p.from && !p.until) return 'Siempre';
  if (p.from && !p.until) return `Desde ${short(p.from)}`;
  if (!p.from && p.until) return `Hasta ${short(p.until)}`;
  const [fd, fm] = [Number(p.from!.slice(8)), p.from!.slice(5, 7)];
  if (fm === p.until!.slice(5, 7)) return `${fd}–${short(p.until!)}`;
  return `${short(p.from!)}–${short(p.until!)}`;
}

/** Orden para enseñarlas: "Siempre" primero y luego por fecha de inicio. */
export function sortPeriods<T extends TemplatePeriod>(periods: T[]): T[] {
  return [...periods].sort((a, b) => (a.from ?? '').localeCompare(b.from ?? '') || (a.until ?? '9999').localeCompare(b.until ?? '9999'));
}

/** Semanas (lunes–domingo) desde la actual, para crear una plantilla de una semana. */
export function upcomingWeeks(today: Date, count: number): TemplatePeriod[] {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return Array.from({ length: count }, (_, i) => {
    const from = new Date(monday); from.setDate(monday.getDate() + i * 7);
    const until = new Date(from); until.setDate(from.getDate() + 6);
    return { from: iso(from), until: iso(until) };
  });
}

/** "DD/MM/AAAA" → "YYYY-MM-DD", o null si no es una fecha válida. */
export function parseDmy(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" → "DD/MM/AAAA" */
export function formatDmy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

type DatedRow = { valid_from: string | null; valid_until: string | null; class_type?: string };
const isMarker = (r: DatedRow) => r.class_type === '';

/** Reservas fijas por semana de la plantilla que manda ese día (0 si ninguna). */
export function effectiveSlotCount(rows: DatedRow[], dateStr: string): number {
  const periods = new Map<string, TemplatePeriod>();
  rows.forEach(r => { const p = { from: r.valid_from, until: r.valid_until }; periods.set(periodKey(p), p); });
  const eff = effectivePeriod(Array.from(periods.values()), dateStr);
  if (!eff) return 0;
  const key = periodKey(eff);
  return rows.filter(r => !isMarker(r) && periodKey({ from: r.valid_from, until: r.valid_until }) === key).length;
}

/** La plantilla más cargada (reservas fijas por semana), para comprobar el cupo del plan. */
export function maxPeriodSlotCount(rows: DatedRow[]): number {
  const counts = new Map<string, number>();
  rows.filter(r => !isMarker(r)).forEach(r => { const k = periodKey({ from: r.valid_from, until: r.valid_until }); counts.set(k, (counts.get(k) || 0) + 1); });
  return Math.max(0, ...Array.from(counts.values()));
}
