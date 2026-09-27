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
  /**
   * No fue una baja sino un cambio a otra clase del mismo día: "a las 18:00 ·
   * CROSS TRAINING". Lo marca el trigger link_class_change en la base de datos.
   */
  movedTo: string | null;
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
    .select('id, class_id, user_id, cancelled_at, cancelled_by, replaced_by, moved_to_class_id')
    .in('class_id', classes.map(c => c.id))
    .order('cancelled_at', { ascending: false });
  if (error || !data || data.length === 0) return {};

  const ids = new Set<string>();
  data.forEach(r => { ids.add(r.user_id); if (r.replaced_by) ids.add(r.replaced_by); });
  // Perfiles y, si hay cambios de clase, las clases de destino: a la vez
  const movedIds = [...new Set(data.map(r => r.moved_to_class_id).filter(Boolean))] as string[];
  const [{ data: profiles }, { data: movedClasses }] = await Promise.all([
    supabase.from('profiles').select('id, username, full_name, email, avatar_url').in('id', [...ids]),
    movedIds.length > 0
      ? supabase.from('classes').select('id, name, class_time').in('id', movedIds)
      : Promise.resolve({ data: [] as { id: string; name: string; class_time: string }[] }),
  ]);
  const movedLabel = new Map((movedClasses || []).map(c => [c.id, `a las ${c.class_time.slice(0, 5)} · ${c.name}`]));
  const byId = new Map((profiles || []).map(p => [p.id, p]));
  const nameOf = (id: string) => {
    const p = byId.get(id);
    // Nombre completo primero: el admin identifica a la gente por su nombre
    return p ? (p.full_name || getDisplayName(p)) : 'Cuenta borrada';
  };

  const startById = new Map(classes.map(c => [c.id, new Date(`${c.class_date}T${c.class_time}`)]));
  const result: Record<string, ClassCancellation[]> = {};

  for (const r of data as (CancellationRow & { id: string; class_id: string; moved_to_class_id: string | null })[]) {
    const start = startById.get(r.class_id);
    if (!start) continue;
    const movedTo = r.moved_to_class_id ? (movedLabel.get(r.moved_to_class_id) ?? 'a otra clase del mismo día') : null;
    (result[r.class_id] ||= []).push({
      id: r.id,
      userId: r.user_id,
      name: nameOf(r.user_id),
      avatar: byId.get(r.user_id)?.avatar_url ?? null,
      cancelledAt: r.cancelled_at,
      by: whoCancelled(r),
      notice: formatNotice(minutesBeforeClass(r.cancelled_at, start)),
      // Un cambio de clase no deja el hueco vacío de la misma forma: no es "última hora"
      late: !movedTo && isLateCancellation(r, start),
      replacedByName: r.replaced_by ? nameOf(r.replaced_by) : null,
      rebooked: (bookedByClass[r.class_id] || []).includes(r.user_id),
      movedTo,
    });
  }
  return result;
}
