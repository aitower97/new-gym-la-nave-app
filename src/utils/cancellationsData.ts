import { supabase } from '../lib/supabase';
import {
  CancellationRow,
  CancelledBy,
  formatNotice,
  isLateCancellation,
  minutesBeforeClass,
  whoCancelled,
} from './cancellations';
import { getDisplayName } from './user';

/** Una baja lista para pintar (admin). */
export interface ClassCancellation {
  id: string;
  userId: string;
  name: string;
  avatar: string | null;
  cancelledAt: string;
  by: CancelledBy;
  /** "3 h antes", "25 min antes"... */
  notice: string;
  late: boolean;
  /** Quién ocupó la plaza desde la lista de espera, si alguien. */
  replacedByName: string | null;
  /** Volvió a apuntarse después de borrarse. */
  rebooked: boolean;
}

interface ClassRef {
  id: string;
  class_date: string;
  class_time: string;
}

/**
 * Bajas de varias clases en dos consultas (bajas + perfiles). Solo funciona
 * para el admin: la RLS de booking_cancellations no deja ver nada a nadie más.
 * `bookedByClass` = quién está apuntado ahora, para marcar "volvió a apuntarse".
 */
export async function loadCancellations(
  classes: ClassRef[],
  bookedByClass: Record<string, string[]> = {},
): Promise<Record<string, ClassCancellation[]>> {
  if (classes.length === 0) return {};

  const { data, error } = await supabase
    .from('booking_cancellations')
    .select('id, class_id, user_id, cancelled_at, cancelled_by, replaced_by')
    .in('class_id', classes.map(c => c.id))
    .order('cancelled_at', { ascending: false });
  if (error || !data || data.length === 0) return {};

  const ids = new Set<string>();
  data.forEach(r => { ids.add(r.user_id); if (r.replaced_by) ids.add(r.replaced_by); });
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, full_name, email, avatar_url')
    .in('id', [...ids]);
  const byId = new Map((profiles || []).map(p => [p.id, p]));
  const nameOf = (id: string) => {
    const p = byId.get(id);
    // Nombre completo primero: el admin identifica a la gente por su nombre
    return p ? (p.full_name || getDisplayName(p)) : 'Cuenta borrada';
  };

  const startById = new Map(classes.map(c => [c.id, new Date(`${c.class_date}T${c.class_time}`)]));
  const result: Record<string, ClassCancellation[]> = {};

  for (const r of data as (CancellationRow & { id: string; class_id: string })[]) {
    const start = startById.get(r.class_id);
    if (!start) continue;
    (result[r.class_id] ||= []).push({
      id: r.id,
      userId: r.user_id,
      name: nameOf(r.user_id),
      avatar: byId.get(r.user_id)?.avatar_url ?? null,
      cancelledAt: r.cancelled_at,
      by: whoCancelled(r),
      notice: formatNotice(minutesBeforeClass(r.cancelled_at, start)),
      late: isLateCancellation(r, start),
      replacedByName: r.replaced_by ? nameOf(r.replaced_by) : null,
      rebooked: (bookedByClass[r.class_id] || []).includes(r.user_id),
    });
  }
  return result;
}
