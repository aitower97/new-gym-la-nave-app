-- 1) Las cuentas demo (profiles.is_demo) tampoco las ve el admin.
--
-- Se hace en las políticas de lectura del admin, no en la app: así
-- desaparecen a la vez de Usuarios, estadísticas del panel, detalle de clase,
-- pagos y bajas, también en las versiones ya instaladas.
--
-- demo_user_ids() devuelve la lista una vez por consulta (subselect →
-- InitPlan); un "NOT EXISTS (… profiles …)" dentro de la política no valdría,
-- porque esa subconsulta pasaría por la propia RLS de profiles, que ya
-- oculta las demo. De paso, is_admin() también va en subselect: antes se
-- evaluaba una vez por fila.

CREATE OR REPLACE FUNCTION public.demo_user_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(id), '{}') FROM public.profiles WHERE is_demo;
$function$;

REVOKE EXECUTE ON FUNCTION public.demo_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.demo_user_ids() TO authenticated;

ALTER POLICY "Admins can read all profiles" ON public.profiles
  USING ((SELECT public.is_admin()) AND NOT is_demo);

ALTER POLICY "Admins can read all bookings" ON public.bookings
  USING ((SELECT public.is_admin()) AND NOT (user_id = ANY ((SELECT public.demo_user_ids())::uuid[])));

ALTER POLICY plan_payments_admin_select ON public.plan_payments
  USING ((SELECT public.is_admin()) AND NOT (user_id = ANY ((SELECT public.demo_user_ids())::uuid[])));

ALTER POLICY booking_cancellations_admin_select ON public.booking_cancellations
  USING ((SELECT public.is_admin()) AND NOT (user_id = ANY ((SELECT public.demo_user_ids())::uuid[])));

-- 2) Cambio de clase ≠ baja.
--
-- La app cambia de clase borrando la reserva vieja y creando la nueva (dos
-- peticiones), así que el registro de bajas lo apuntaba como baja. Si el mismo
-- socio reserva otra clase del MISMO día en los 15 minutos siguientes a
-- borrarse, la baja se marca como cambio y se guarda a qué clase fue.

ALTER TABLE public.booking_cancellations
  ADD COLUMN IF NOT EXISTS moved_to_class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS booking_cancellations_user_id_idx ON public.booking_cancellations (user_id);

CREATE OR REPLACE FUNCTION public.link_class_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.booking_cancellations SET moved_to_class_id = NEW.class_id
  WHERE id = (
    SELECT bc.id
    FROM public.booking_cancellations bc
    JOIN public.classes c_old ON c_old.id = bc.class_id
    JOIN public.classes c_new ON c_new.id = NEW.class_id
    WHERE bc.user_id = NEW.user_id
      AND bc.moved_to_class_id IS NULL
      AND bc.class_id <> NEW.class_id
      AND c_old.class_date = c_new.class_date
      AND bc.cancelled_at > now() - interval '15 minutes'
    ORDER BY bc.cancelled_at DESC
    LIMIT 1
  );
  RETURN NEW;
END $function$;

CREATE TRIGGER trg_link_class_change
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.link_class_change();

-- Las bajas ya registradas que en realidad fueron cambios
UPDATE public.booking_cancellations bc SET moved_to_class_id = x.new_class
FROM (
  SELECT DISTINCT ON (bc2.id) bc2.id AS bc_id, b.class_id AS new_class
  FROM public.booking_cancellations bc2
  JOIN public.classes c_old ON c_old.id = bc2.class_id
  JOIN public.bookings b ON b.user_id = bc2.user_id AND b.class_id <> bc2.class_id
  JOIN public.classes c_new ON c_new.id = b.class_id
  WHERE bc2.moved_to_class_id IS NULL
    AND c_old.class_date = c_new.class_date
    AND b.created_at BETWEEN bc2.cancelled_at AND bc2.cancelled_at + interval '15 minutes'
  ORDER BY bc2.id, b.created_at
) x
WHERE bc.id = x.bc_id;
