/**
 * waitlist.ts — Lista de espera de clases.
 *
 * Cuando una clase está llena el socio puede apuntarse. Si alguien cancela,
 * entra el primero de la cola: eso lo hace un trigger en la base de datos, no
 * la app — quien cancela cierra la aplicación al segundo siguiente y su móvil
 * no puede ser el responsable de avisar a otro.
 *
 * Aquí solo vive lo que el socio hace a mano: apuntarse, salirse y ver en qué
 * puesto está. Las reglas (clase llena, más de 2h por delante, no estar ya
 * dentro ni en esa cola) las decide can_join_waitlist en la base; se consultan
 * desde aquí para poder dar un mensaje decente en vez de dejar que falle la
 * política RLS con un error críptico. Se puede estar en varias colas a la vez.
 */

import { supabase } from '../lib/supabase';

export interface WaitlistEntry {
  classId: string;
  /** 1 = el siguiente en entrar. */
  position: number;
  total: number;
}

/** Las colas en las que está el socio, por clase. Puede estar en varias. */
export async function getMyWaitlistEntries(userId: string): Promise<Record<string, WaitlistEntry>> {
  const { data } = await supabase.from('class_waitlist').select('class_id').eq('user_id', userId);
  if (!data || data.length === 0) return {};

  const filas = await Promise.all(
    data.map(async ({ class_id }) => {
      const { data: pos } = await supabase.rpc('waitlist_position', { p_class_id: class_id });
      const fila = Array.isArray(pos) ? pos[0] : pos;
      return { classId: class_id, position: fila?.posicion ?? 1, total: fila?.total ?? 1 };
    })
  );
  return Object.fromEntries(filas.map(f => [f.classId, f]));
}

export interface WaitlistCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Por qué no puede apuntarse, en cristiano. La base ya lo impide igualmente:
 * esto solo sirve para explicarlo.
 */
export async function checkCanJoinWaitlist(userId: string, classId: string): Promise<WaitlistCheck> {
  const { data, error } = await supabase.rpc('can_join_waitlist', {
    p_user_id: userId,
    p_class_id: classId,
  });

  if (error) return { allowed: false, reason: 'No se pudo comprobar la lista de espera. Inténtalo de nuevo.' };
  if (data === true) return { allowed: true };

  return {
    allowed: false,
    reason: 'Ya tienes plaza, ya estás en la lista o empieza en menos de 2 h.',
  };
}

/**
 * keepBoth: si ya tiene otra clase ese día, true = al entrar se queda con las
 * dos; false = se le cambia desde la otra (lo que hace promote_from_waitlist).
 */
export async function joinWaitlist(userId: string, classId: string, keepBoth = false): Promise<void> {
  const { error } = await supabase.from('class_waitlist').insert({ user_id: userId, class_id: classId, keep_both: keepBoth });
  if (error) throw error;
}

export async function leaveWaitlist(userId: string, classId: string): Promise<void> {
  const { error } = await supabase
    .from('class_waitlist')
    .delete()
    .eq('user_id', userId)
    .eq('class_id', classId);
  if (error) throw error;
}
