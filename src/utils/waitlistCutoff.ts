/**
 * waitlistCutoff.ts — Hasta cuándo entra gente de la lista de espera.
 *
 * Es un ajuste del admin (app_settings.waitlist_cutoff_minutes): minutos antes
 * de la clase a partir de los cuales ya no sube nadie de la cola ni se puede
 * apuntar uno nuevo. La base lo impone (fill_waitlist_vacancy y
 * can_join_waitlist); la app solo lo muestra y lo edita. Lógica pura para Jest.
 */

export const WAITLIST_CUTOFF_KEY = 'waitlist_cutoff_minutes';
export const DEFAULT_WAITLIST_CUTOFF_MINUTES = 30;

/** Opciones del panel, en minutos. 0 = hasta que empieza la clase. */
export const WAITLIST_CUTOFF_PRESETS = [0, 15, 30, 60, 120];

/** Valor guardado -> minutos válidos; cualquier otra cosa, el de por defecto. */
export function parseWaitlistCutoff(value: string | null | undefined): number {
  if (value == null || !/^\d+$/.test(value.trim())) return DEFAULT_WAITLIST_CUTOFF_MINUTES;
  return parseInt(value, 10);
}

/** Las opciones del panel, incluido un valor fuera de lista (puesto a mano en la base). */
export function waitlistCutoffOptions(current: number): number[] {
  return WAITLIST_CUTOFF_PRESETS.includes(current)
    ? WAITLIST_CUTOFF_PRESETS
    : [...WAITLIST_CUTOFF_PRESETS, current].sort((a, b) => a - b);
}

/** "Al empezar", "15 min", "1 h", "1 h 30 min" */
export function formatWaitlistCutoff(minutes: number): string {
  if (minutes <= 0) return 'Al empezar';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
