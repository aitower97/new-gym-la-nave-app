/**
 * waitlist.ts — Lista de espera de clases.
 *
 * Cuando una clase está llena el socio puede apuntarse. Si alguien cancela,
 * entra el primero de la cola: eso lo hace un trigger en la base de datos, no
 * la app — quien cancela cierra la aplicación al segundo siguiente y su móvil
 * no puede ser el responsable de avisar a otro.
 *
 * Aquí solo vive lo que el socio hace a mano: apuntarse, salirse y ver en qué
 * puesto está. Las reglas (clase llena, más de 2h por delante, una sola lista
 * a la vez) las decide can_join_waitlist en la base; se consultan desde aquí
 * para poder dar un mensaje decente en vez de dejar que falle la política RLS
 * con un error críptico.
 */

import { supabase } from '../lib/supabase';

export interface WaitlistEntry {
  classId: string;
  /** 1 = el siguiente en entrar. */
  position: number;
  total: number;
}

/** La entrada del socio, si está en alguna lista. Solo puede estar en una. */
export async function getMyWaitlistEntry(userId: string): Promise<WaitlistEntry | null> {
  const { data } = await supabase
    .from('class_waitlist')
    .select('class_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return null;

  const { data: pos } = await supabase.rpc('waitlist_position', { p_class_id: data.class_id });
  const fila = Array.isArray(pos) ? pos[0] : pos;

  return {
    classId: data.class_id,
    position: fila?.posicion ?? 1,
    total: fila?.total ?? 1,
  };
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

  // La función devuelve un booleano sin motivo, así que el motivo se deduce
  // aquí con una consulta más. Solo se paga cuando ya sabemos que es un "no".
  const yaEnOtra = await supabase
    .from('class_waitlist')
    .select('class_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (yaEnOtra.data && yaEnOtra.data.class_id !== classId) {
    return {
      allowed: false,
      reason: 'Ya estás en la lista de espera de otra clase. Sal de esa primero para apuntarte a esta.',
    };
  }

  return {
    allowed: false,
    reason: 'No puedes apuntarte a esta lista: o ya tienes plaza, o quedan menos de 2 horas para que empiece.',
  };
}

export async function joinWaitlist(userId: string, classId: string): Promise<void> {
  const { error } = await supabase.from('class_waitlist').insert({ user_id: userId, class_id: classId });
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
