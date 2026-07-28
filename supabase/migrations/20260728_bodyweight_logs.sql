-- Registro de peso corporal del usuario (para la tendencia en "Mi progreso").
-- Un registro por usuario y día; RLS igual que workout_logs (dueño gestiona
-- el suyo, admin puede leer el de cualquiera).

CREATE TABLE IF NOT EXISTS bodyweight_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg DECIMAL(5,1) NOT NULL CHECK (weight_kg > 0 AND weight_kg < 500),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE bodyweight_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own bodyweight logs"
  ON bodyweight_logs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all bodyweight logs"
  ON bodyweight_logs FOR SELECT TO authenticated
  USING (public.is_admin());
