import { supabase } from '../lib/supabase';

export type RenameExerciseResult = 'ok' | 'needs_merge' | 'not_found' | 'invalid' | 'not_allowed';

/**
 * Renombra un ejercicio en todo el historial de un socio (rename_exercise en
 * la BD). Sin `merge`, si el nombre nuevo ya existe devuelve 'needs_merge'
 * para preguntar antes de juntar los dos historiales.
 */
export async function renameExercise(
  userId: string,
  oldName: string,
  newName: string,
  merge = false,
): Promise<RenameExerciseResult> {
  const { data, error } = await supabase.rpc('rename_exercise', {
    p_user_id: userId,
    p_old_name: oldName,
    p_new_name: newName,
    p_merge: merge,
  });
  if (error) throw error;
  return data as RenameExerciseResult;
}
