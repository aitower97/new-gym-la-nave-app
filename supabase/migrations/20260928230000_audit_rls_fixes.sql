-- Auditoría final: tres huecos en las reglas de acceso.
--
-- 1. notifications: la política "Service role can insert notifications"
--    (INSERT, rol public, WITH CHECK true) dejaba a CUALQUIERA, incluso sin
--    sesión (anon), crear notificaciones para cualquier socio. El service
--    role ya se salta RLS y las funciones SQL que notifican son SECURITY
--    DEFINER, así que sobraba. Admins y socios siguen con sus políticas.
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;

-- 2. workout_exercises: "Anyone can read exercises" (USING true) dejaba a un
--    socio leer los ejercicios personales de los demás. Todas las consultas
--    de la app de socio piden solo los globales (user_id NULL) o los suyos.
DROP POLICY IF EXISTS "Anyone can read exercises" ON public.workout_exercises;
CREATE POLICY "Read global or own exercises" ON public.workout_exercises
  FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = (SELECT auth.uid()) OR public.is_admin());

-- 3. profiles: un socio podía poner free_trial_used_at a NULL en su perfil
--    y volver a tener la clase de prueba gratis. Solo lo cambian los admins
--    o los triggers (mark_free_trial_used / release_free_trial corren como
--    SECURITY DEFINER pero auth.uid() sigue siendo el socio, así que se
--    distinguen por pg_trigger_depth()).
CREATE OR REPLACE FUNCTION public.prevent_self_plan_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.plan_id IS DISTINCT FROM OLD.plan_id
      OR NEW.plan_assigned_at IS DISTINCT FROM OLD.plan_assigned_at)
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado para cambiar el plan asignado';
  END IF;
  -- Clase de prueba: solo admins o triggers de reservas (profundidad > 1).
  IF NEW.free_trial_used_at IS DISTINCT FROM OLD.free_trial_used_at
     AND auth.uid() IS NOT NULL
     AND pg_trigger_depth() <= 1
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado para cambiar la clase de prueba';
  END IF;
  RETURN NEW;
END;
$function$;
