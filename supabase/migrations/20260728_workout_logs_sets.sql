-- Añade el número de series a cada registro de entreno. Hasta ahora
-- workout_logs solo guardaba peso+reps de UNA serie por ejercicio y día,
-- sin distinguir un 4x6 de un 10x2 (mismo peso/reps, volumen muy distinto).
-- Default 1 para no romper registros existentes (se interpretan como 1 serie).

ALTER TABLE workout_logs
  ADD COLUMN IF NOT EXISTS sets SMALLINT NOT NULL DEFAULT 1 CHECK (sets > 0);
