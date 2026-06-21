-- Añadir columnas a profiles (si no existen)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES membership_plans(id) ON DELETE SET NULL;

-- Añadir columnas a membership_plans (si no existen)
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'gym';
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS billing_period TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE membership_plans ADD COLUMN IF NOT EXISTS sort_order SMALLINT DEFAULT 0;

-- RLS: perfiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Permitir a usuarios leer su propio perfil
CREATE POLICY IF NOT EXISTS "Users can read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

-- Permitir a usuarios actualizar su propio perfil
CREATE POLICY IF NOT EXISTS "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Admin puede leer todos los perfiles
CREATE POLICY IF NOT EXISTS "Admins can read all profiles"
  ON profiles FOR SELECT USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Admin puede actualizar cualquier perfil
CREATE POLICY IF NOT EXISTS "Admins can update any profile"
  ON profiles FOR UPDATE
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- RLS: membership_plans
ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Anyone can read plans"
  ON membership_plans FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "Admins can manage plans"
  ON membership_plans FOR ALL
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Asignar rol admin al primer usuario (ajusta el email)
-- UPDATE profiles SET role = 'admin' WHERE email = 'admin@example.com';
