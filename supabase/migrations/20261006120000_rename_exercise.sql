-- Renombrar un ejercicio en TODO el historial de un socio (lo hace el socio
-- desde "Mi progreso" o el admin desde el entreno del socio). "Mi progreso"
-- agrupa por nombre, así que renombrar solo un día partiría el historial.
--
-- - Filas propias del socio (user_id = socio): se renombran.
-- - Filas compartidas del entrenador (user_id NULL, las ven todos): NO se tocan.
--   Si el socio tiene registros en ellas, se crea una copia propia inactiva con
--   el nombre nuevo y sus registros pasan a ella. La pantalla de Entreno ya
--   enseña esos registros ("Fuera de la sesión").
-- - Biblioteca personal: la entrada vieja pasa al nombre nuevo, o desaparece si
--   el nuevo ya estaba.
-- - Si el nombre nuevo ya existe para ese socio, devuelve 'needs_merge' salvo
--   que se pida juntar (p_merge): la app pregunta antes.
--
-- Devuelve: ok · needs_merge · not_found · invalid · not_allowed

CREATE OR REPLACE FUNCTION public.rename_exercise(
  p_user_id uuid,
  p_old_name text,
  p_new_name text,
  p_merge boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old text := lower(btrim(coalesce(p_old_name, '')));
  v_new text := btrim(coalesce(p_new_name, ''));
  v_shared record;
  v_copy_id uuid;
BEGIN
  IF p_user_id IS NULL OR NOT (public.is_admin() OR p_user_id = auth.uid()) THEN
    RETURN 'not_allowed';
  END IF;

  IF v_old = '' OR v_new = '' OR length(v_new) > 100 THEN
    RETURN 'invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM workout_exercises e
    WHERE lower(btrim(e.name)) = v_old
      AND (e.user_id = p_user_id
           OR (e.user_id IS NULL AND EXISTS (
                 SELECT 1 FROM workout_logs l WHERE l.exercise_id = e.id AND l.user_id = p_user_id)))
  ) AND NOT EXISTS (
    SELECT 1 FROM exercise_library WHERE user_id = p_user_id AND lower(btrim(name)) = v_old
  ) THEN
    RETURN 'not_found';
  END IF;

  -- Solo cambian mayúsculas/espacios: no hay nada que juntar
  IF lower(v_new) <> v_old AND NOT p_merge AND (
    EXISTS (
      SELECT 1 FROM workout_exercises e
      WHERE lower(btrim(e.name)) = lower(v_new)
        AND (e.user_id = p_user_id
             OR (e.user_id IS NULL AND EXISTS (
                   SELECT 1 FROM workout_logs l WHERE l.exercise_id = e.id AND l.user_id = p_user_id)))
    ) OR EXISTS (
      SELECT 1 FROM exercise_library WHERE user_id = p_user_id AND lower(btrim(name)) = lower(v_new)
    )
  ) THEN
    RETURN 'needs_merge';
  END IF;

  UPDATE workout_exercises
     SET name = v_new, updated_at = now()
   WHERE user_id = p_user_id AND lower(btrim(name)) = v_old;

  FOR v_shared IN
    SELECT e.* FROM workout_exercises e
    WHERE e.user_id IS NULL AND lower(btrim(e.name)) = v_old
      AND EXISTS (SELECT 1 FROM workout_logs l WHERE l.exercise_id = e.id AND l.user_id = p_user_id)
  LOOP
    INSERT INTO workout_exercises (
      name, user_id, is_active, session_date, day_of_week, description, sort_order,
      block_name, target_sets, target_reps, target_rpe, target_rpe_max, target_rows
    ) VALUES (
      v_new, p_user_id, false, v_shared.session_date, v_shared.day_of_week, v_shared.description,
      v_shared.sort_order, v_shared.block_name, v_shared.target_sets, v_shared.target_reps,
      v_shared.target_rpe, v_shared.target_rpe_max, v_shared.target_rows
    ) RETURNING id INTO v_copy_id;

    UPDATE workout_logs SET exercise_id = v_copy_id
     WHERE user_id = p_user_id AND exercise_id = v_shared.id;
  END LOOP;

  IF EXISTS (SELECT 1 FROM exercise_library WHERE user_id = p_user_id AND name = v_new) THEN
    DELETE FROM exercise_library
     WHERE user_id = p_user_id AND lower(btrim(name)) = v_old AND name <> v_new;
  ELSE
    UPDATE exercise_library SET name = v_new
     WHERE id = (SELECT id FROM exercise_library
                  WHERE user_id = p_user_id AND lower(btrim(name)) = v_old
                  ORDER BY created_at LIMIT 1);
    DELETE FROM exercise_library
     WHERE user_id = p_user_id AND lower(btrim(name)) = v_old AND name <> v_new;
  END IF;

  RETURN 'ok';
END $$;

REVOKE ALL ON FUNCTION public.rename_exercise(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_exercise(uuid, text, text, boolean) TO authenticated;
