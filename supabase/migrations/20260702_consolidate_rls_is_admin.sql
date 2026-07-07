-- ============================================================================
-- CONSOLIDACIÓN DE POLÍTICAS RLS — 2026-07-02
--
-- Sustituye las políticas de 20260620_rls_policies.sql, que tenían dos
-- problemas:
--   1. `CREATE POLICY IF NOT EXISTS` no existe en Postgres (error de sintaxis),
--      por lo que esa migración nunca pudo ejecutarse tal como estaba escrita.
--   2. Las políticas admin consultaban `profiles` desde políticas de `profiles`
--      → recursión infinita en RLS.
--
-- La fuente de verdad del rol pasa a ser la tabla `user_roles` (la misma que
-- ya usa el código de la app en src/utils/auth.ts), a través de la función
-- `is_admin()` SECURITY DEFINER. La columna `profiles.role` deja de usarse
-- para autorización.
--
-- Incluye el fix del bug: el admin no podía borrar reservas ajenas
-- (faltaba la política DELETE de admin en `bookings`).
--
-- Idempotente: se puede re-ejecutar sin efectos secundarios.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Tabla user_roles (ya existe en producción; guard por si acaso)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 1. Función helper is_admin()
--    SECURITY DEFINER: se ejecuta como el dueño de la función y no dispara
--    la RLS de user_roles, evitando cualquier recursión.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. user_roles: cada usuario lee solo su rol. Sin políticas de escritura:
--    los roles solo se asignan con service_role (dashboard / SQL editor),
--    nadie puede auto-asignarse admin.
-- ----------------------------------------------------------------------------
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own role" ON user_roles;
CREATE POLICY "Users can read own role"
  ON user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. profiles
-- ----------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. classes
-- ----------------------------------------------------------------------------
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read classes" ON classes;
DROP POLICY IF EXISTS "Admins can manage classes" ON classes;

CREATE POLICY "Authenticated users can read classes"
  ON classes FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage classes"
  ON classes FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. bookings — incluye el FIX: admin puede borrar reservas ajenas
-- ----------------------------------------------------------------------------
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own bookings" ON bookings;
DROP POLICY IF EXISTS "Users can create own bookings" ON bookings;
DROP POLICY IF EXISTS "Users can delete own bookings" ON bookings;
DROP POLICY IF EXISTS "Admins can read all bookings" ON bookings;
DROP POLICY IF EXISTS "Admins can create any booking" ON bookings;
DROP POLICY IF EXISTS "Admins can delete any booking" ON bookings;

CREATE POLICY "Users can read own bookings"
  ON bookings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- WITH CHECK impide reservar en nombre de otro usuario
CREATE POLICY "Users can create own bookings"
  ON bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookings"
  ON bookings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all bookings"
  ON bookings FOR SELECT TO authenticated
  USING (public.is_admin());

-- Necesaria para AdminClassPreBookScreen (el admin apunta usuarios a clases)
CREATE POLICY "Admins can create any booking"
  ON bookings FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- ▶ FIX del bug: el admin puede eliminar cualquier reserva
CREATE POLICY "Admins can delete any booking"
  ON bookings FOR DELETE TO authenticated
  USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. workout_notes — solo el dueño; el admin NO tiene acceso
--    (minimización de datos, art. 5.1.c RGPD)
-- ----------------------------------------------------------------------------
ALTER TABLE workout_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own notes" ON workout_notes;

CREATE POLICY "Users manage own notes"
  ON workout_notes FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 7. push_tokens — dueño gestiona el suyo; admin puede LEER todos
--    (necesario para el envío de push desde el panel admin)
-- ----------------------------------------------------------------------------
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own push token" ON push_tokens;
DROP POLICY IF EXISTS "Admins can read all push tokens" ON push_tokens;

CREATE POLICY "Users can manage their own push token"
  ON push_tokens FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all push tokens"
  ON push_tokens FOR SELECT TO authenticated
  USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 8. notifications — el usuario lee/marca leídas/borra las suyas;
--    puede crear las propias (booking_created) y el admin crear para cualquiera
-- ----------------------------------------------------------------------------
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can create own notifications" ON notifications;
DROP POLICY IF EXISTS "Admins can create notifications for anyone" ON notifications;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own notifications"
  ON notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can create notifications for anyone"
  ON notifications FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 9. user_memberships — el usuario lee la suya; el admin gestiona todas
-- ----------------------------------------------------------------------------
ALTER TABLE user_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own membership" ON user_memberships;
DROP POLICY IF EXISTS "Admins can manage memberships" ON user_memberships;

CREATE POLICY "Users can read own membership"
  ON user_memberships FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage memberships"
  ON user_memberships FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 10. membership_plans — reescritura con is_admin()
--     (las anteriores consultaban profiles.role)
-- ----------------------------------------------------------------------------
ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read plans" ON membership_plans;
DROP POLICY IF EXISTS "Admins can manage plans" ON membership_plans;

CREATE POLICY "Anyone can read plans"
  ON membership_plans FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage plans"
  ON membership_plans FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 11. workout_exercises / workout_logs — reescritura con is_admin()
--     (sustituye las políticas de 20260620_create_workout_tracking.sql
--      y 20260620_admin_workout_logs_write.sql que consultaban profiles.role)
-- ----------------------------------------------------------------------------
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read exercises" ON workout_exercises;
DROP POLICY IF EXISTS "Admins can manage exercises" ON workout_exercises;

CREATE POLICY "Anyone can read exercises"
  ON workout_exercises FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage exercises"
  ON workout_exercises FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users can manage their own logs" ON workout_logs;
DROP POLICY IF EXISTS "Admins can read all logs" ON workout_logs;
DROP POLICY IF EXISTS "Admins can insert workout logs" ON workout_logs;
DROP POLICY IF EXISTS "Admins can update workout logs" ON workout_logs;
DROP POLICY IF EXISTS "Admins can delete workout logs" ON workout_logs;

CREATE POLICY "Users can manage their own logs"
  ON workout_logs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all logs"
  ON workout_logs FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can insert workout logs"
  ON workout_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update workout logs"
  ON workout_logs FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete workout logs"
  ON workout_logs FOR DELETE TO authenticated
  USING (public.is_admin());

-- ----------------------------------------------------------------------------
-- 12. Asegurar que el admin actual tiene su fila en user_roles.
--     ⚠️ Descomenta y ajusta el email antes de ejecutar.
-- ----------------------------------------------------------------------------
-- INSERT INTO user_roles (user_id, role)
-- SELECT id, 'admin' FROM auth.users WHERE email = 'admin@tugimnasio.es'
-- ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
