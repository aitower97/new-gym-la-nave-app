-- Eliminar un ejercicio oficial del catálogo (solo admin).
-- Para confirmar hay que escribir su nombre (p_confirm_name); se comprueba
-- AQUÍ, no solo en la app. Si tiene registros, se borran también las marcas
-- de los socios con él (la app enseña antes cuántas). Para los repetidos es
-- mejor "unir", que no pierde nada.
-- Se van con él: sus filas de sesión (y sus marcas), su preset de la
-- biblioteca, sus sinónimos y los ejercicios que ya se habían unido a él.
-- Devuelve: ok · name_mismatch · not_found · not_allowed

DROP FUNCTION IF EXISTS public.admin_delete_exercise(uuid);

CREATE OR REPLACE FUNCTION public.admin_delete_exercise(p_id uuid, p_confirm_name text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e exercises%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RETURN 'not_allowed'; END IF;
  SELECT * INTO e FROM exercises WHERE id = p_id AND is_official AND merged_into IS NULL;
  IF e.id IS NULL THEN RETURN 'not_found'; END IF;
  IF public.exercise_key(p_confirm_name) IS DISTINCT FROM e.norm_name THEN RETURN 'name_mismatch'; END IF;

  DELETE FROM workout_exercises WHERE exercise_id = p_id;  -- sus marcas: ON DELETE CASCADE
  DELETE FROM exercise_library WHERE exercise_id = p_id;
  -- Los que se habían unido a él (ya sin filas: se movieron al unir)
  DELETE FROM exercise_library WHERE exercise_id IN (SELECT id FROM exercises WHERE merged_into = p_id);
  DELETE FROM exercises WHERE merged_into = p_id;
  DELETE FROM exercises WHERE id = p_id;  -- sinónimos y descartes: ON DELETE CASCADE
  RETURN 'ok';
END $$;

REVOKE ALL ON FUNCTION public.admin_delete_exercise(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_exercise(uuid, text) TO authenticated;

-- Catálogo para el admin: por cada oficial, cuántos socios lo han registrado
-- y cuántas marcas tiene (lo que importa, no cuántas filas de sesión), y sus
-- sinónimos.
CREATE OR REPLACE FUNCTION public.exercise_catalog()
RETURNS TABLE (id uuid, name text, archived boolean, members int, logs int, aliases text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN; END IF;
  RETURN QUERY
  SELECT e.id, e.name, e.archived_at IS NOT NULL,
         (SELECT count(DISTINCT l.user_id)::int FROM workout_logs l JOIN workout_exercises w ON w.id = l.exercise_id WHERE w.exercise_id = e.id),
         (SELECT count(*)::int FROM workout_logs l JOIN workout_exercises w ON w.id = l.exercise_id WHERE w.exercise_id = e.id),
         coalesce((SELECT array_agg(a.norm_alias ORDER BY a.norm_alias) FROM exercise_aliases a WHERE a.exercise_id = e.id), '{}')
  FROM exercises e
  WHERE e.is_official AND e.merged_into IS NULL
  ORDER BY e.name;
END $$;

REVOKE ALL ON FUNCTION public.exercise_catalog() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exercise_catalog() TO authenticated;
