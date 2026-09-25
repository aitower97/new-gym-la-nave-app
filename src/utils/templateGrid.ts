/**
 * Filas (horas) y columnas (días) del cuadrante de plantillas del admin,
 * sacadas de las clases reales en vez de una lista fija: si el gimnasio abre
 * un horario nuevo (p. ej. las 11:00), aparece solo. Lógica pura para Jest.
 */

export interface GridClass {
  class_date: string; // 'YYYY-MM-DD'
  class_time: string; // 'HH:MM' o 'HH:MM:SS'
}

export interface GridTemplate {
  day_of_week: number; // 0 = domingo
  class_time: string;
}

export interface TemplateGrid {
  /** 'HH:MM:SS', ordenadas */
  times: string[];
  /** day_of_week en orden L → D */
  days: number[];
  /** `${day}-${time}` con al menos una clase real en el rango */
  withClasses: Set<string>;
}

// Hasta que haya clases creadas, para que la pantalla no salga vacía
export const FALLBACK_TIMES = ['07:00:00', '08:00:00', '09:00:00', '10:00:00', '17:00:00', '18:00:00', '19:00:00', '20:00:00'];
export const FALLBACK_DAYS = [1, 2, 3, 4, 5];

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** '9:00' / '09:00' / '09:00:00' → '09:00:00' (el formato de booking_templates) */
export function normalizeTime(t: string): string {
  const [h = '0', m = '0', s = '0'] = t.split(':');
  return [h, m, s].map(p => p.padStart(2, '0').slice(0, 2)).join(':');
}

/** Día de la semana de 'YYYY-MM-DD' sin pasar por zonas horarias */
export function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function buildTemplateGrid(classes: GridClass[], templates: GridTemplate[]): TemplateGrid {
  const times = new Set<string>();
  const days = new Set<number>();
  const withClasses = new Set<string>();

  for (const c of classes) {
    const time = normalizeTime(c.class_time);
    const day = dayOfWeek(c.class_date);
    times.add(time);
    days.add(day);
    withClasses.add(`${day}-${time}`);
  }

  // Lo que ya tiene la plantilla se enseña siempre, aunque ya no haya clase,
  // para poder verlo y quitarlo.
  for (const t of templates) {
    times.add(normalizeTime(t.class_time));
    days.add(t.day_of_week);
  }

  if (times.size === 0) FALLBACK_TIMES.forEach(t => times.add(t));
  if (days.size === 0) FALLBACK_DAYS.forEach(d => days.add(d));

  return {
    times: [...times].sort(),
    days: WEEK_ORDER.filter(d => days.has(d)),
    withClasses,
  };
}
