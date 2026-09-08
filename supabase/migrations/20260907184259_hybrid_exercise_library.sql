-- Biblioteca de ejercicios híbrida: hasta ahora exercise_library era
-- exclusiva del admin (RLS solo is_admin(), sin SELECT para socios) y el
-- socio que entrena por su cuenta escribía el nombre del ejercicio a mano
-- cada vez, sin guardarlo para la próxima sesión. Se replica el mismo
-- patrón "global vs personal" que ya usa workout_exercises (user_id NULL =
-- del entrenador/global, user_id set = propio del socio).
ALTER TABLE public.exercise_library
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- El UNIQUE(name) global no sirve ya: dos socios distintos (o un socio y el
-- catálogo del entrenador) pueden querer un ejercicio con el mismo nombre
-- sin pisarse. Se sustituye por dos índices únicos parciales: nombres
-- globales únicos entre sí, y nombres únicos por socio dentro de lo suyo.
ALTER TABLE public.exercise_library DROP CONSTRAINT IF EXISTS exercise_library_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS exercise_library_global_name_key
  ON public.exercise_library (name) WHERE user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS exercise_library_user_name_key
  ON public.exercise_library (user_id, name) WHERE user_id IS NOT NULL;

-- RLS: mismo patrón que workout_exercises — lectura abierta (biblioteca
-- global + de todos los socios, mismo dato de baja sensibilidad que ya se
-- comparte así en workout_exercises), altas/bajas propias solo de lo suyo,
-- el admin sigue gestionando el catálogo global vía la policy ALL existente.
DROP POLICY IF EXISTS "Anyone can read exercise library" ON public.exercise_library;
CREATE POLICY "Anyone can read exercise library" ON public.exercise_library
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "users_insert_custom_exercise_library" ON public.exercise_library;
CREATE POLICY "users_insert_custom_exercise_library" ON public.exercise_library
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users_delete_own_exercise_library" ON public.exercise_library;
CREATE POLICY "users_delete_own_exercise_library" ON public.exercise_library
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
