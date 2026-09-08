-- Limpieza de políticas RLS duplicadas/heredadas detectadas en la auditoría
-- de seguridad de hoy (~35 avisos multiple_permissive_policies). Cada DROP
-- de aquí se verificó primero fila a fila (pg_policies) para confirmar que
-- la política que se mantiene concede EXACTAMENTE el mismo acceso neto que
-- las que se eliminan (unión sin cambios) — no se toca ninguna política
-- basada en profiles.role (classes: admins_can_delete/insert/update_classes;
-- admin_actions; booking_templates), porque is_admin() comprueba user_roles
-- y no hay trigger que garantice que profiles.role y user_roles.role vayan
-- siempre sincronizados — eso queda para una decisión aparte, no es "solo
-- ruido" como el resto de esta lista.

-- bookings DELETE: duplicado literal (mismo qual, nombre en español heredado).
DROP POLICY IF EXISTS "Usuarios pueden cancelar sus propias reservas" ON public.bookings;

-- classes SELECT: "Todos pueden ver las clases" (public) ya cubre a
-- "Authenticated users can read classes" (authenticated), ambas qual=true.
DROP POLICY IF EXISTS "Authenticated users can read classes" ON public.classes;

-- membership_plans SELECT: "Anyone can select membership_plans" (public,
-- qual=true) ya cubre a las otras dos (una es la misma en scope
-- authenticated, la otra un subconjunto is_active=true).
DROP POLICY IF EXISTS "Anyone can read plans" ON public.membership_plans;
DROP POLICY IF EXISTS "Anyone can view active plans" ON public.membership_plans;

-- notifications: las versiones "their own" (public) ya cubren a las
-- versiones "own" (authenticated) — mismo qual, solo difieren en scope de
-- rol, y public ⊇ authenticated.
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
-- admins_insert_notifications concede (auth.uid()=user_id) OR is_admin() —
-- exactamente la unión de "Users can create own notifications" +
-- "Admins can create notifications for anyone", que ya existen por separado.
DROP POLICY IF EXISTS "admins_insert_notifications" ON public.notifications;

-- push_tokens: "Users can manage their own tokens" (public) ya cubre a
-- "Users can manage their own push token" (authenticated), mismo qual.
-- admins_read_push_tokens concede (own) OR is_admin() — ya cubierto por la
-- política ALL de arriba (own) + "Admins can read all push tokens" (admin).
DROP POLICY IF EXISTS "Users can manage their own push token" ON public.push_tokens;
DROP POLICY IF EXISTS "admins_read_push_tokens" ON public.push_tokens;

-- workout_notes ALL: duplicado literal, solo difieren en scope de rol.
DROP POLICY IF EXISTS "Users manage own notes" ON public.workout_notes;

-- workout_logs: 4 políticas admin de un solo cmd, todas con la misma
-- condición is_admin() — se consolidan en una sola ALL, mismo efecto neto.
DROP POLICY IF EXISTS "Admins can delete workout logs" ON public.workout_logs;
DROP POLICY IF EXISTS "Admins can insert workout logs" ON public.workout_logs;
DROP POLICY IF EXISTS "Admins can read all logs" ON public.workout_logs;
DROP POLICY IF EXISTS "Admins can update workout logs" ON public.workout_logs;
CREATE POLICY "Admins can manage workout logs" ON public.workout_logs
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
