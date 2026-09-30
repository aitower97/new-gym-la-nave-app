/**
 * waitlistMoves.ts — "Te hemos cambiado" de la lista de espera (datos).
 *
 * La base apunta el cambio (fill_waitlist_vacancy → waitlist_moves) y la app
 * lo contesta con resolve_waitlist_move. Lógica pura en waitlistMoveModel.ts.
 */

import { supabase } from '../lib/supabase';
import { getMaxClassesPerDay } from './bookingSettings';
import { MoveAction, PendingMove } from './waitlistMoveModel';

/** El cambio pendiente de contestar (el más antiguo que aún tiene sentido), o null. */
export async function fetchMyPendingMove(userId: string): Promise<PendingMove | null> {
  const { data, error } = await supabase
    .from('waitlist_moves')
    .select('id, to_class_id, to:classes!waitlist_moves_to_class_id_fkey(name, class_date, class_time), from:classes!waitlist_moves_from_class_id_fkey(class_date, class_time)')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at');
  if (error || !data) return null;

  const now = Date.now();
  for (const row of data as any[]) {
    const to = Array.isArray(row.to) ? row.to[0] : row.to;
    const from = Array.isArray(row.from) ? row.from[0] : row.from;
    if (!to || !from) continue;
    // Si su clase anterior ya empezó, ya no hay nada que decidir
    if (new Date(`${from.class_date}T${from.class_time}`).getTime() <= now) continue;

    const [{ data: sameDay }, maxPerDay] = await Promise.all([
      supabase
        .from('bookings')
        .select('class_id, classes!inner(class_date)')
        .eq('user_id', userId)
        .eq('classes.class_date', to.class_date),
      getMaxClassesPerDay(),
    ]);
    const ids = ((sameDay || []) as any[]).map((b) => b.class_id);
    // Si ya no está en la clase nueva (la canceló), no se pregunta
    if (!ids.includes(row.to_class_id)) continue;

    return {
      id: row.id,
      toClassName: to.name,
      toClassDate: to.class_date,
      toClassTime: to.class_time,
      fromClassTime: from.class_time,
      sameDayCount: ids.length,
      maxPerDay,
    };
  }
  return null;
}

export async function resolveMove(moveId: string, action: MoveAction): Promise<string> {
  const { data, error } = await supabase.rpc('resolve_waitlist_move', { p_move_id: moveId, p_action: action });
  if (error) throw error;
  return String(data);
}

// Aviso entre el modal (a nivel de app) y las pantallas abiertas: al
// contestar cambian reservas y colas, y Reservar debe recargar.
type Listener = () => void;
const listeners = new Set<Listener>();

export function onWaitlistMoveResolved(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function emitWaitlistMoveResolved(): void {
  listeners.forEach((l) => l());
}
