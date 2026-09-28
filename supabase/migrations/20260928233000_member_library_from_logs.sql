-- Biblioteca del socio: es individual, no ve la general del admin. Contiene
-- los ejercicios que el socio se crea (la app los guarda al crearlos) y los
-- ejercicios de clase en los que ha guardado algún dato. Esto último lo hace
-- este trigger: al registrar una serie de un ejercicio de clase (user_id
-- NULL), el ejercicio pasa a la biblioteca de ese socio. Si luego lo quita
-- de su biblioteca y vuelve a registrarlo, vuelve a aparecer.

CREATE OR REPLACE FUNCTION public.add_logged_exercise_to_library()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.exercise_library
    (name, description, default_sets, default_reps, default_rpe, default_rpe_max, user_id)
  SELECT btrim(we.name), we.description, we.target_sets, we.target_reps,
         we.target_rpe, we.target_rpe_max, NEW.user_id
  FROM public.workout_exercises we
  WHERE we.id = NEW.exercise_id
    AND we.user_id IS NULL
    AND btrim(we.name) <> ''
    AND NOT EXISTS (
      SELECT 1 FROM public.exercise_library l
      WHERE l.user_id = NEW.user_id AND lower(l.name) = lower(btrim(we.name))
    )
  ON CONFLICT (user_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_logged_exercise_to_library() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_add_logged_exercise_to_library ON public.workout_logs;
CREATE TRIGGER trg_add_logged_exercise_to_library
  AFTER INSERT ON public.workout_logs
  FOR EACH ROW EXECUTE FUNCTION public.add_logged_exercise_to_library();

-- Recuperar lo ya registrado: ejercicios de clase con datos de cada socio.
INSERT INTO public.exercise_library
  (name, description, default_sets, default_reps, default_rpe, default_rpe_max, user_id)
SELECT DISTINCT ON (l.user_id, lower(btrim(we.name)))
       btrim(we.name), we.description, we.target_sets, we.target_reps,
       we.target_rpe, we.target_rpe_max, l.user_id
FROM public.workout_logs l
JOIN public.workout_exercises we ON we.id = l.exercise_id
WHERE we.user_id IS NULL AND btrim(we.name) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.exercise_library x
    WHERE x.user_id = l.user_id AND lower(x.name) = lower(btrim(we.name))
  )
ORDER BY l.user_id, lower(btrim(we.name)), we.created_at DESC
ON CONFLICT (user_id, name) DO NOTHING;
