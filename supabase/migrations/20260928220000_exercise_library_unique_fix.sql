-- Biblioteca de ejercicios: el guardado nunca funcionaba.
--
-- Los índices únicos eran PARCIALES (uno WHERE user_id IS NULL para los
-- globales y otro WHERE user_id IS NOT NULL para los personales) y un
-- upsert con on_conflict no puede usar índices parciales: cada guardado
-- fallaba con "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification" y la app lo ignoraba por "no crítico". Resultado:
-- 9 ejercicios globales (el último del 04/08) y 0 personales, con 73
-- ejercicios distintos usados en las sesiones.
--
-- Una sola restricción (user_id, name) con NULLS NOT DISTINCT cubre los dos
-- casos: global = user_id NULL (único por nombre), personal = único por
-- socio y nombre. on_conflict=user_id,name funciona para ambos.

DROP INDEX IF EXISTS public.exercise_library_global_name_key;
DROP INDEX IF EXISTS public.exercise_library_user_name_key;

ALTER TABLE public.exercise_library
  ADD CONSTRAINT exercise_library_user_name_key UNIQUE NULLS NOT DISTINCT (user_id, name);

-- Recuperar lo que debería haberse guardado: ejercicios usados en sesiones.
-- Globales (sesiones del admin) con los valores de su uso más reciente.
INSERT INTO public.exercise_library (name, description, default_sets, default_reps, default_rpe, default_rpe_max, user_id)
SELECT DISTINCT ON (btrim(we.name))
       btrim(we.name), we.description, we.target_sets, we.target_reps, we.target_rpe, we.target_rpe_max, NULL
FROM public.workout_exercises we
WHERE we.user_id IS NULL AND btrim(we.name) <> ''
ORDER BY btrim(we.name), we.created_at DESC
ON CONFLICT (user_id, name) DO NOTHING;

-- Personales (ejercicios que se crearon los socios), salvo los que ya existen
-- como globales con el mismo nombre: saldrían repetidos en su lista.
INSERT INTO public.exercise_library (name, description, default_sets, default_reps, default_rpe, default_rpe_max, user_id)
SELECT DISTINCT ON (we.user_id, btrim(we.name))
       btrim(we.name), we.description, we.target_sets, we.target_reps, we.target_rpe, we.target_rpe_max, we.user_id
FROM public.workout_exercises we
WHERE we.user_id IS NOT NULL AND btrim(we.name) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.exercise_library g
    WHERE g.user_id IS NULL AND lower(g.name) = lower(btrim(we.name))
  )
ORDER BY we.user_id, btrim(we.name), we.created_at DESC
ON CONFLICT (user_id, name) DO NOTHING;
