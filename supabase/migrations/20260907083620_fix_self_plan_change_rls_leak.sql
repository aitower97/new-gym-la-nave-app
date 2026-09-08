-- 🔴 CRÍTICO, hallado en la auditoría de seguridad de hoy: las políticas RLS
-- de UPDATE en profiles ("Users can update own profile" / "profiles_update_own")
-- no restringen columnas — cualquier socio autenticado puede hacer
-- PATCH /rest/v1/profiles?id=eq.<su-propio-id> con su propio JWT (sin ser
-- admin) y cambiarse plan_id a CUALQUIER plan (incluido uno ilimitado o un
-- bono), saltándose por completo el pago. Con el bono de hoy, además puede
-- refrescar plan_assigned_at a voluntad para renovar la validez del bono
-- indefinidamente gratis. Es la misma clase de bug que ya se arregló para
-- `role` en 20260820_fix_critical_rls_leaks.sql (mismo patrón de trigger,
-- solo para `role`) — plan_id ya estaba desprotegido desde antes, y
-- plan_assigned_at (añadido hoy) extiende el mismo agujero al bono.
CREATE OR REPLACE FUNCTION public.prevent_self_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.plan_id IS DISTINCT FROM OLD.plan_id
      OR NEW.plan_assigned_at IS DISTINCT FROM OLD.plan_assigned_at)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado para cambiar el plan asignado';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_self_plan_change ON public.profiles;
CREATE TRIGGER trg_prevent_self_plan_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_plan_change();

REVOKE ALL ON FUNCTION public.prevent_self_plan_change() FROM PUBLIC;

-- 🟡 MEDIO, mismo hallazgo: can_user_book se reescribió 3 veces hoy vía
-- DROP FUNCTION + CREATE (cambio de firma de 1 a 2 argumentos), y ninguna de
-- las reescrituras volvió a poner el REVOKE/GRANT que sí tenía la versión
-- original — Postgres concede EXECUTE a PUBLIC por defecto en toda función
-- nueva, así que quedó invocable sin autenticar via
-- /rest/v1/rpc/can_user_book. Solo devuelve un booleano, pero es un oráculo
-- no autenticado del estado de cupo/mora/plan de cualquier user_id.
REVOKE ALL ON FUNCTION public.can_user_book(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_user_book(uuid, uuid) TO authenticated;
