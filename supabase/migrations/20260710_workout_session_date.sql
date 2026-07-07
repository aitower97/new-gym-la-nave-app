-- ============================================================================
-- SESIONES DE ENTRENO POR FECHA CONCRETA — 2026-07-10
--
-- Cambio de modelo: antes los ejercicios globales se repetían por día de la
-- semana (day_of_week: "todos los lunes"). Ahora el entrenador monta la sesión
-- de UNA FECHA concreta (session_date). "Cada día es un mundo": el lunes que
-- viene no tiene nada que ver con el de esta semana.
--
--   · Global   → user_id NULL  + session_date = <fecha>  (la ve todo el mundo
--                 que entrena ese día, en cualquier clase/horario)
--   · Por user → user_id = <id> + session_date = <fecha>  (extra para 1 persona)
--
-- day_of_week deja de ser obligatorio (se conserva para las filas antiguas,
-- pero las sesiones nuevas van por fecha).
-- ============================================================================

ALTER TABLE workout_exercises
  ADD COLUMN IF NOT EXISTS session_date DATE;

ALTER TABLE workout_exercises
  ALTER COLUMN day_of_week DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workout_exercises_session_date
  ON workout_exercises(session_date)
  WHERE session_date IS NOT NULL;
