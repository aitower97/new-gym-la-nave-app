/**
 * Contador de cambios hechos desde la app (reservar, cancelar, apuntar una
 * marca...). Lo sube el cliente de Supabase en cada escritura
 * (src/lib/supabase.ts); las pantallas lo miran para no recargar al volver
 * si nada ha cambiado (useRefreshOnReturn con skipIfFreshMs).
 *
 * Los cambios que hace otra persona o un cron no pasan por aquí: por eso
 * las pantallas recargan igualmente pasado un rato.
 */

let version = 0;

export function markDataChanged(): void {
  version += 1;
}

export function getDataVersion(): number {
  return version;
}

// Funciones de la base de datos que solo LEEN: llamarlas no cambia nada.
// Cualquier otra (o una nueva que no esté aquí) cuenta como cambio: si nos
// equivocamos, se recarga de más, nunca de menos.
const READ_ONLY_RPCS = new Set([
  'day_schedule',
  'my_waitlist_entries',
  'quota_usage',
  'quota_period_start',
  'class_waitlist_public',
  'waitlist_position',
  'can_join_waitlist',
  'can_user_book',
  'suggest_exercises',
  'exercise_catalog',
  'exercise_review_queue',
  'last_attendance_bulk',
]);

/** ¿Esta petición a Supabase cambia datos? (para el fetch del cliente) */
export function isWriteRequest(url: string, method: string | undefined): boolean {
  const m = (method || 'GET').toUpperCase();
  if (m === 'GET' || m === 'HEAD') return false;
  if (url.includes('/auth/v1/')) return false;
  const rpc = url.match(/\/rest\/v1\/rpc\/([a-z0-9_]+)/i);
  if (rpc) return !READ_ONLY_RPCS.has(rpc[1]);
  return url.includes('/rest/v1/') || url.includes('/storage/v1/') || url.includes('/functions/v1/');
}
