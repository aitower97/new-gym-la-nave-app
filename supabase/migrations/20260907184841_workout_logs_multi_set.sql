-- Series múltiples por ejercicio/día: el admin quiere poder registrar varias
-- series de un mismo ejercicio con peso/RPE distintos en la misma sesión
-- (rampa de peso subiendo o bajando). Hasta ahora UNIQUE(user_id,
-- exercise_id, date) obligaba a una sola fila por ejercicio/día — una fila
-- ahora es UNA serie (o un grupo de series idénticas, "sets" sigue siendo el
-- contador dentro de esa fila), y set_number distingue varias filas del
-- mismo ejercicio el mismo día entre sí.
ALTER TABLE public.workout_logs
  ADD COLUMN IF NOT EXISTS set_number SMALLINT NOT NULL DEFAULT 1 CHECK (set_number > 0);

ALTER TABLE public.workout_logs
  DROP CONSTRAINT IF EXISTS workout_logs_user_id_exercise_id_date_key;

ALTER TABLE public.workout_logs
  ADD CONSTRAINT workout_logs_user_id_exercise_id_date_set_number_key
  UNIQUE (user_id, exercise_id, date, set_number);
