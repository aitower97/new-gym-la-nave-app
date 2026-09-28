-- RPE con medios puntos (7,5) y rangos ("RPE 7/8" = entre 7 y 8).
--
-- Antes eran smallint: 7,5 no cabía. Ahora numeric(3,1) en pasos de 0,5, y
-- un *_max opcional para el rango (min = la columna de siempre). Las
-- versiones instaladas siguen funcionando: escriben enteros, que siguen
-- siendo válidos, e ignoran *_max.
--
-- Estimaciones (1RM, medias): un rango cuenta como su punto medio
-- (src/utils/rpe.ts, rpeForEstimate). La tabla de e1rm.ts ya iba en pasos
-- de 0,5.
--
-- target_rows (jsonb, filas del objetivo del admin) admite igual "rpe" con
-- decimal y "rpe_max" opcional; eso no necesita cambio de esquema.

ALTER TABLE public.workout_logs      ALTER COLUMN rpe         TYPE numeric(3,1);
ALTER TABLE public.workout_exercises ALTER COLUMN target_rpe  TYPE numeric(3,1);
ALTER TABLE public.exercise_library  ALTER COLUMN default_rpe TYPE numeric(3,1);

ALTER TABLE public.workout_logs      ADD COLUMN IF NOT EXISTS rpe_max         numeric(3,1);
ALTER TABLE public.workout_exercises ADD COLUMN IF NOT EXISTS target_rpe_max  numeric(3,1);
ALTER TABLE public.exercise_library  ADD COLUMN IF NOT EXISTS default_rpe_max numeric(3,1);

-- Pasos de 0,5 y rango bien formado (max > min, max <= 10)
ALTER TABLE public.workout_logs ADD CONSTRAINT workout_logs_rpe_half_step
  CHECK (rpe IS NULL OR rpe * 2 = trunc(rpe * 2));
ALTER TABLE public.workout_logs ADD CONSTRAINT workout_logs_rpe_max_range
  CHECK (rpe_max IS NULL OR (rpe IS NOT NULL AND rpe_max > rpe AND rpe_max <= 10 AND rpe_max * 2 = trunc(rpe_max * 2)));

ALTER TABLE public.workout_exercises ADD CONSTRAINT workout_exercises_target_rpe_half_step
  CHECK (target_rpe IS NULL OR target_rpe * 2 = trunc(target_rpe * 2));
ALTER TABLE public.workout_exercises ADD CONSTRAINT workout_exercises_target_rpe_max_range
  CHECK (target_rpe_max IS NULL OR (target_rpe IS NOT NULL AND target_rpe_max > target_rpe AND target_rpe_max <= 10 AND target_rpe_max * 2 = trunc(target_rpe_max * 2)));

ALTER TABLE public.exercise_library ADD CONSTRAINT exercise_library_default_rpe_half_step
  CHECK (default_rpe IS NULL OR default_rpe * 2 = trunc(default_rpe * 2));
ALTER TABLE public.exercise_library ADD CONSTRAINT exercise_library_default_rpe_max_range
  CHECK (default_rpe_max IS NULL OR (default_rpe IS NOT NULL AND default_rpe_max > default_rpe AND default_rpe_max <= 10 AND default_rpe_max * 2 = trunc(default_rpe_max * 2)));
