-- El peso deja de ser obligatorio: ejercicios sin carga (dominadas a peso
-- corporal, carrera, movilidad...) se registran solo con series/reps.
ALTER TABLE workout_logs ALTER COLUMN weight DROP NOT NULL;
