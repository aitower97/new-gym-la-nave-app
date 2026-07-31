-- Bloques dentro de una sesión (ej: Calentamiento, Skills, WOD). Se guarda
-- como texto libre y editable en cada ejercicio, sin tabla aparte: el bloque
-- "existe" mientras al menos un ejercicio de esa sesión comparta el nombre.
-- NULL = sin bloque (comportamiento actual, compatible con lo existente).

ALTER TABLE workout_exercises
  ADD COLUMN IF NOT EXISTS block_name TEXT;
