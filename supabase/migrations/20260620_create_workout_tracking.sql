-- Ejercicios base por día de la semana (Lunes=0, Martes=1, ...)
CREATE TABLE IF NOT EXISTS workout_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  description TEXT,
  sort_order SMALLINT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Registros de peso máximos
CREATE TABLE IF NOT EXISTS workout_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  weight DECIMAL(6,1) NOT NULL,
  reps SMALLINT DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, exercise_id, date)
);

ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read exercises"
  ON workout_exercises FOR SELECT USING (true);

CREATE POLICY "Admins can manage exercises"
  ON workout_exercises FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Users can manage their own logs"
  ON workout_logs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all logs"
  ON workout_logs FOR SELECT
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Datos iniciales (L-V)
INSERT INTO workout_exercises (name, day_of_week, description, sort_order) VALUES
  ('Sentadilla', 1, 'Sentadilla clásica con barra', 0),
  ('Press de Banca', 2, 'Press de banca plano con barra', 0),
  ('Halterofilia', 3, 'Arrancada, dos tiempos, cargada', 0),
  ('Peso Muerto', 4, 'Peso muerto convencional o sumo', 0),
  ('Ejercicio Libre', 5, 'Ejercicio a elección del usuario', 0)
ON CONFLICT DO NOTHING;
