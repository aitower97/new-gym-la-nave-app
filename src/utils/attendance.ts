import { supabase } from '../lib/supabase';

/** true = vino · false = no vino · null = sin marcar */
export type Attendance = boolean | null;

/**
 * Marca la asistencia (solo admin, y solo desde que empieza la clase). Al
 * marcar "no vino" el socio recibe un aviso, una sola vez por reserva — lo
 * decide la base de datos (set_attendance).
 */
export async function setAttendance(bookingId: string, attended: Attendance): Promise<string> {
  const { data, error } = await supabase.rpc('set_attendance', { p_booking_id: bookingId, p_attended: attended });
  if (error) throw error;
  return data as string;
}

/** Pulsar el botón que ya está marcado lo desmarca. */
export const nextAttendance = (current: Attendance, pressed: boolean): Attendance =>
  current === pressed ? null : pressed;

/** La clase ya empezó (hora local del móvil, que es la del gimnasio). */
export function classHasStarted(classDate: string, classTime: string, now = new Date()): boolean {
  const [y, m, d] = classDate.split('-').map(Number);
  const [hh, mm] = classTime.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm) <= now;
}
