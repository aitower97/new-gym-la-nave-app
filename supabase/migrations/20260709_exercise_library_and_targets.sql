-- ============================================================================
-- BIBLIOTECA DE EJERCICIOS + OBJETIVOS (series/reps/RPE) — 2026-07-09
--
-- 1. workout_exercises gana series/reps/RPE OBJETIVO (lo que prescribe el
--    entrenador), independiente de weight/reps/rpe REALES que el usuario
--    registra en workout_logs.
--
-- 2. exercise_library: catálogo reutilizable de ejercicios (nombre + valores
--    por defecto). El entrenador lo va rellenando según crea ejercicios
--    nuevos, y para días siguientes puede elegir de la biblioteca en vez de
--    escribir el nombre otra vez.
-- ============================================================================

ALTER TABLE workout_exercises
  ADD COLUMN IF NOT EXISTS target_sets SMALLINT,
  ADD COLUMN IF NOT EXISTS target_reps SMALLINT,
  ADD COLUMN IF NOT EXISTS target_rpe SMALLINT CHECK (target_rpe IS NULL OR (target_rpe BETWEEN 1 AND 10));

CREATE TABLE IF NOT EXISTS exercise_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  default_sets SMALLINT,
  default_reps SMALLINT,
  default_rpe SMALLINT CHECK (default_rpe IS NULL OR (default_rpe BETWEEN 1 AND 10)),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE exercise_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage exercise library" ON exercise_library;
CREATE POLICY "Admins can manage exercise library"
  ON exercise_library FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
