-- Auditoría de seguridad pre-producción (2026-08-20): dos hallazgos críticos
-- activos en la BD real, no reflejados en el historial de migraciones del
-- repo (políticas legacy que sobrevivieron a la migración de consolidación
-- 20260702_consolidate_rls_is_admin.sql en vez de borrarse).
--
-- CRÍTICO 1 — profiles.SELECT: "Admins can select any profile" y
-- "profiles_select_all" tenían USING (true), sin roles: public. Al ser
-- políticas PERMISSIVE, coexistían con las correctas (auth.uid()=id /
-- is_admin()) y bastaba con que UNA fuera true para dar acceso — cualquier
-- usuario podía leer email/teléfono/fecha de nacimiento de todos los demás.
--
-- CRÍTICO 2 — escalada de privilegios: "Users can update own profile" /
-- "profiles_update_own" permiten a cada usuario actualizar CUALQUIER columna
-- de su propia fila, incluida `role`. Encadenado con políticas legacy en
-- membership_plans/bookings que aún confiaban en profiles.role (en vez de
-- is_admin()/user_roles, la fuente de verdad real), un usuario podía
-- ponerse role='admin' a sí mismo y desde ahí gestionar planes de membresía
-- o insertar reservas en nombre de otros usuarios.

-- 1. Cerrar la fuga de PII en profiles.
DROP POLICY IF EXISTS "Admins can select any profile" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;

-- 2. Defensa en profundidad: nadie (salvo admin) puede cambiar su propia
--    columna role, aunque las políticas de UPDATE de profiles solo
--    comprueben auth.uid()=id sin restricción de columnas.
CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado para cambiar el rol';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_role_change ON public.profiles;
CREATE TRIGGER trg_prevent_self_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_change();

-- 3. Eliminar las políticas legacy que confiaban en profiles.role en vez de
--    is_admin()/user_roles. Las políticas correctas ya existen en paralelo
--    ("Admins can manage plans" ALL is_admin() en membership_plans,
--    "Admins can create any booking" WITH CHECK is_admin() en bookings) así
--    que nada de la funcionalidad de admin deja de funcionar.
DROP POLICY IF EXISTS "Admins pueden insertar" ON public.membership_plans;
DROP POLICY IF EXISTS "Admins can insert membership_plans" ON public.membership_plans;
DROP POLICY IF EXISTS "Admins pueden actualizar" ON public.membership_plans;
DROP POLICY IF EXISTS "Admins can update membership_plans" ON public.membership_plans;
DROP POLICY IF EXISTS "Admins pueden eliminar" ON public.membership_plans;
DROP POLICY IF EXISTS "Admins can delete membership_plans" ON public.membership_plans;
DROP POLICY IF EXISTS "admins_can_insert_any_booking" ON public.bookings;
