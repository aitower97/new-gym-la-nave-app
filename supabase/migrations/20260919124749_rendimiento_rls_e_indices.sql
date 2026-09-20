-- ============================================================================
-- RENDIMIENTO: RLS E ÍNDICES — 2026-09-19
--
-- Dos cosas distintas, con valor muy distinto:
--
--  1. Envolver auth.uid() en (select auth.uid()) en las políticas. Sin el
--     SELECT, Postgres trata la llamada como volátil y la reevalúa UNA VEZ
--     POR FILA; envuelta, se evalúa una sola vez como InitPlan.
--
--     Seamos honestos con la magnitud: hoy `bookings` tiene ~309 filas y
--     `profiles` ~49, así que esto no arregla ninguna lentitud actual. Es
--     reescritura de riesgo cero que evita el problema cuando las tablas
--     crezcan, no una optimización con efecto medible ahora.
--
--  2. Quitar duplicados reales (políticas idénticas e índices redundantes).
--     Esto sí es deuda: dos políticas que hacen lo mismo significan que
--     cambiar una no cambia el comportamiento, y eso confunde al siguiente
--     que las toque.
--
-- Los roles de cada política se preservan EXACTAMENTE como estaban. Varias
-- están en `public` donde `authenticated` bastaría, pero eso es un cambio de
-- semántica y no toca mezclarlo con una pasada de rendimiento.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Duplicados exactos: sobra una de cada par
-- ----------------------------------------------------------------------------

-- "Users can view their own membership" (public, user_id = auth.uid()) es la
-- misma condición que "Users can read own membership" (authenticated,
-- auth.uid() = user_id). Se queda la de `authenticated`.
DROP POLICY IF EXISTS "Users can view their own membership" ON public.user_memberships;

-- profiles_update_own es idéntica a "Users can update own profile".
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;


-- ----------------------------------------------------------------------------
-- 2. auth.uid() -> (select auth.uid())
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can manage their own bodyweight logs" ON public.bodyweight_logs;
CREATE POLICY "Users can manage their own bodyweight logs" ON public.bodyweight_logs
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users_view_own_templates" ON public.booking_templates;
CREATE POLICY "users_view_own_templates" ON public.booking_templates
  FOR SELECT
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create own bookings" ON public.bookings;
CREATE POLICY "Users can create own bookings" ON public.bookings
  FOR INSERT
  WITH CHECK (((select auth.uid()) = user_id) AND can_user_book(user_id, class_id));

DROP POLICY IF EXISTS "Users can delete own bookings" ON public.bookings;
CREATE POLICY "Users can delete own bookings" ON public.bookings
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can read own bookings" ON public.bookings;
CREATE POLICY "Users can read own bookings" ON public.bookings
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users_delete_own_exercise_library" ON public.exercise_library;
CREATE POLICY "users_delete_own_exercise_library" ON public.exercise_library
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "users_insert_custom_exercise_library" ON public.exercise_library;
CREATE POLICY "users_insert_custom_exercise_library" ON public.exercise_library
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "users_read_own_exercise_library" ON public.exercise_library;
CREATE POLICY "users_read_own_exercise_library" ON public.exercise_library
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create own notifications" ON public.notifications;
CREATE POLICY "Users can create own notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications" ON public.notifications
  FOR DELETE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications
  FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "plan_payments_select_own" ON public.plan_payments;
CREATE POLICY "plan_payments_select_own" ON public.plan_payments
  FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can manage their own tokens" ON public.push_tokens;
CREATE POLICY "Users can manage their own tokens" ON public.push_tokens
  FOR ALL
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can read own membership" ON public.user_memberships;
CREATE POLICY "Users can read own membership" ON public.user_memberships
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
CREATE POLICY "Users can read own role" ON public.user_roles
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users_delete_own_exercises" ON public.workout_exercises;
CREATE POLICY "users_delete_own_exercises" ON public.workout_exercises
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "users_insert_custom_exercises" ON public.workout_exercises;
CREATE POLICY "users_insert_custom_exercises" ON public.workout_exercises
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can manage their own logs" ON public.workout_logs;
CREATE POLICY "Users can manage their own logs" ON public.workout_logs
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage own notes" ON public.workout_notes;
CREATE POLICY "Users can manage own notes" ON public.workout_notes
  FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- ----------------------------------------------------------------------------
-- 3. Índices
-- ----------------------------------------------------------------------------

-- bookings.user_id es FK y además la columna por la que filtra la política de
-- lectura, pero no tenía índice propio: el único que la incluye es
-- bookings_class_id_user_id_key, que empieza por class_id y por tanto no
-- sirve para buscar por usuario. Con 309 filas da igual, pero `bookings` es
-- la tabla que crece con el uso del gimnasio.
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings (user_id);

-- Índices redundantes: en ambos casos existe ya un índice ÚNICO sobre la
-- misma columna, que sirve exactamente las mismas búsquedas por igualdad.
-- Mantener los dos solo añade coste en cada escritura.
--
-- Las estadísticas de este proyecto nunca se han reiniciado (stats_reset es
-- null), así que su contador de usos a 0 significa «jamás usado», no
-- «sin datos recientes».
DROP INDEX IF EXISTS public.idx_push_tokens_user_id;  -- vs push_tokens_user_id_key (UNIQUE)
DROP INDEX IF EXISTS public.idx_user_roles_user_id;   -- vs user_roles_user_id_key  (UNIQUE)


-- ============================================================================
-- LO QUE NO SE HACE AQUÍ
--
-- · Consolidar las ~39 «multiple permissive policies» (fusionar la política
--   de admin y la de usuario en una sola con `is_admin() OR user_id = ...`).
--   Reduciría a la mitad las evaluaciones por consulta, pero son más de 20
--   políticas reescritas con riesgo real de cambiar quién ve qué, a cambio de
--   nada medible con estas tablas. Si algún día crecéis, es el siguiente paso.
--
-- · Borrar los índices sin usar de tablas de 17-69 filas
--   (idx_booking_templates_active, idx_booking_templates_day, idx_templates_day,
--   idx_notifications_read, idx_user_memberships_active, idx_user_roles_role,
--   idx_admin_actions_created_at). No estorban lo suficiente como para
--   justificar decidirlo por ti; se pueden quitar cuando quieras.
-- ============================================================================
