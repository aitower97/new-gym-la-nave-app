-- Asistencia: el admin marca, durante la clase o después, quién vino (✓) y
-- quién no (✗) desde la ficha de la clase. Sin marcar = no se sabe (null).
--
-- Al marcar un ✗ el socio recibe un aviso para que la próxima vez cancele y
-- deje la plaza libre. Una sola vez por reserva (absence_notified_at), aunque
-- el admin marque y desmarque, y solo si la clase fue hace menos de 2 días:
-- un aviso por una clase de hace semanas no tiene sentido.
--
-- Se hace por RPC y no con una política UPDATE en bookings: así el socio no
-- puede tocar nada de su reserva y la regla de "la clase ya empezó" vive aquí.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS attended boolean,
  ADD COLUMN IF NOT EXISTS absence_notified_at timestamptz;

CREATE OR REPLACE FUNCTION public.set_attendance(p_booking_id uuid, p_attended boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_class public.classes%ROWTYPE;
  v_start timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN 'not_allowed';
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  SELECT * INTO v_class FROM public.classes WHERE id = v_booking.class_id;
  v_start := (v_class.class_date + v_class.class_time) AT TIME ZONE 'Europe/Madrid';
  IF v_start > now() THEN
    RETURN 'not_started';
  END IF;

  UPDATE public.bookings SET attended = p_attended WHERE id = p_booking_id;

  IF p_attended IS FALSE
     AND v_booking.absence_notified_at IS NULL
     AND v_start > now() - interval '2 days' THEN
    PERFORM public._notify_class_push(
      v_booking.user_id,
      'class_absence',
      'No te vimos en clase',
      v_class.name || ', ' || to_char(v_class.class_time, 'HH24:MI')
        || '. Si no vas a venir, cancela y deja la plaza libre.',
      v_class.id
    );
    UPDATE public.bookings SET absence_notified_at = now() WHERE id = p_booking_id;
  END IF;

  RETURN 'ok';
END $$;

REVOKE ALL ON FUNCTION public.set_attendance(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_attendance(uuid, boolean) TO authenticated;

-- "Última asistencia" (avisos de inactividad, ficha del socio) ya no cuenta
-- las clases en las que el admin marcó que no vino.
CREATE OR REPLACE FUNCTION public.last_attendance(p_user_id uuid)
RETURNS timestamp with time zone
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT max((c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid')
  FROM public.bookings b
  JOIN public.classes c ON c.id = b.class_id
  WHERE b.user_id = p_user_id
    AND b.attended IS DISTINCT FROM false
    AND (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid' < now();
$function$;

CREATE OR REPLACE FUNCTION public.last_attendance_bulk(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, last_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un admin puede consultar la asistencia de los socios';
  END IF;

  RETURN QUERY
  SELECT b.user_id,
         max((c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid')
  FROM public.bookings b
  JOIN public.classes c ON c.id = b.class_id
  WHERE b.user_id = ANY (p_user_ids)
    AND b.attended IS DISTINCT FROM false
    AND (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid' < now()
  GROUP BY b.user_id;
END;
$function$;
