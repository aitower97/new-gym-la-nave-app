/**
 * Bajas de clase (tabla booking_cancellations) contadas para el admin:
 * quién la hizo, con cuánta antelación y si fue a última hora. Lógica pura
 * para Jest.
 */

/**
 * Por debajo de esto la plaza ya no pasa a la lista de espera
 * (promote_from_waitlist corta a 2 h), así que una baja así deja el hueco
 * vacío: es la que le interesa al admin.
 */
export const LATE_CANCEL_HOURS = 2;

export type CancelledBy = 'self' | 'admin' | 'system';

export interface CancellationRow {
  user_id: string;
  cancelled_at: string;
  cancelled_by: string | null;
  replaced_by: string | null;
}

export function whoCancelled(row: Pick<CancellationRow, 'user_id' | 'cancelled_by'>): CancelledBy {
  if (!row.cancelled_by) return 'system';
  return row.cancelled_by === row.user_id ? 'self' : 'admin';
}

export const CANCELLED_BY_LABEL: Record<CancelledBy, string> = {
  self: 'Se borró',
  admin: 'Lo quitó un admin',
  system: 'Automática',
};

/** Minutos entre la baja y el inicio de la clase (negativo = ya había empezado). */
export function minutesBeforeClass(cancelledAt: string, classStart: Date): number {
  return Math.round((classStart.getTime() - new Date(cancelledAt).getTime()) / 60_000);
}

/** "25 min antes", "3 h antes", "2 días antes", "con la clase empezada" */
export function formatNotice(minutes: number): string {
  if (minutes < 0) return 'con la clase empezada';
  if (minutes < 60) return `${minutes} min antes`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h antes`;
  return `${Math.floor(hours / 24)} días antes`;
}

/** Tarde = el propio socio se borra con menos de LATE_CANCEL_HOURS. */
export function isLateCancellation(row: Pick<CancellationRow, 'user_id' | 'cancelled_by' | 'cancelled_at'>, classStart: Date): boolean {
  return whoCancelled(row) === 'self' && minutesBeforeClass(row.cancelled_at, classStart) < LATE_CANCEL_HOURS * 60;
}
