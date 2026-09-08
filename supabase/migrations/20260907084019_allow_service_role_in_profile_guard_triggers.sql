-- La nueva Edge Function create-user actualiza profiles.role/plan_id/
-- plan_assigned_at con el cliente de service_role (createUser() ya deja la
-- fila base via el trigger on_auth_user_created; create-user solo rellena
-- rol y plan). Bajo service_role, auth.uid() es NULL — is_admin() evalúa
-- a false para NULL, así que trg_prevent_self_plan_change (de hoy) y
-- trg_prevent_self_role_change (ya existente) bloqueaban ese UPDATE
-- legítimo con "No autorizado". Un caller sin auth.uid() SOLO puede llegar
-- aquí vía service_role (RLS exige auth.uid() = id o is_admin(), ambos
-- requieren un JWT real con sub — un usuario anon/autenticado normal nunca
-- llega a estos triggers con auth.uid() NULL), así que es seguro dejarlo
-- pasar sin más comprobación: la clave de service_role ya es en sí misma la
-- autorización.
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
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_self_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado para cambiar el rol';
  END IF;
  RETURN NEW;
END;
$function$;
