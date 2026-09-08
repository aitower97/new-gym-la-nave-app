-- Permite al admin definir varias filas objetivo (series/reps/RPE) para el
-- mismo ejercicio en la plantilla del día (ej: calentamiento + serie pesada).
-- Aditivo y retrocompatible: cuando es NULL, se sigue usando el trío escalar
-- target_sets/target_reps/target_rpe exactamente como hasta ahora — no hace
-- falta migrar datos existentes. Cuando tiene contenido, representa TODAS
-- las filas objetivo (incluida la primera) y tiene prioridad sobre el trío
-- escalar en el cliente.
alter table workout_exercises
  add column target_rows jsonb;

alter table workout_exercises
  add constraint workout_exercises_target_rows_is_array
  check (target_rows is null or jsonb_typeof(target_rows) = 'array');
