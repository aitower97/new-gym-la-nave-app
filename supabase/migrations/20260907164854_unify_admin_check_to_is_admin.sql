-- Unifica las últimas 7 políticas que comprobaban admin vía
-- "EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND
-- profiles.role = 'admin')" para que usen is_admin() (que mira user_roles)
-- en su lugar — una sola fuente de verdad de quién es admin en todo el
-- proyecto, sin depender de que profiles.role y user_roles.role se
-- mantengan sincronizados a mano (no hay trigger que lo garantice).
--
-- admin_actions y booking_templates: se reescribe la misma política con la
-- nueva condición (mismo nombre, mismo alcance).
DROP POLICY IF EXISTS "admin_actions_insert_admins_only" ON public.admin_actions;
CREATE POLICY "admin_actions_insert_admins_only" ON public.admin_actions
  FOR INSERT TO public
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_actions_select_admins_only" ON public.admin_actions;
CREATE POLICY "admin_actions_select_admins_only" ON public.admin_actions
  FOR SELECT TO public
  USING (is_admin());

DROP POLICY IF EXISTS "admins_full_access_templates" ON public.booking_templates;
CREATE POLICY "admins_full_access_templates" ON public.booking_templates
  FOR ALL TO public
  USING (is_admin());

-- class_types: de paso se corrige que el USING de esta política ALL era
-- "true" en vez de is_admin() — un DELETE bajo esta policy no comprobaba
-- WITH CHECK (no aplica a DELETE) así que cualquiera podía borrar tipos de
-- clase. INSERT/UPDATE quedaban protegidos indirectamente por WITH CHECK,
-- pero DELETE no.
DROP POLICY IF EXISTS "Admins insert/delete class types" ON public.class_types;
CREATE POLICY "Admins insert/delete class types" ON public.class_types
  FOR ALL TO public
  USING (is_admin())
  WITH CHECK (is_admin());

-- classes: estas 3 quedan totalmente redundantes ahora que confirmamos que
-- "Admins can manage classes" (ALL, is_admin()) ya cubre exactamente lo
-- mismo — se eliminan en vez de reescribirse.
DROP POLICY IF EXISTS "admins_can_delete_classes" ON public.classes;
DROP POLICY IF EXISTS "admins_can_insert_classes" ON public.classes;
DROP POLICY IF EXISTS "admins_can_update_classes" ON public.classes;
