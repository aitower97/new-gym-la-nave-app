-- Última asistencia de varios socios de una vez, para el filtro "inactivos"
-- del panel de notificaciones. Antes el cliente llamaba a last_attendance()
-- una vez por socio (54 viajes a la base por cada pulsación de "Aplicar").
--
-- Misma definición de "asistencia" que last_attendance(), pero restringida a
-- admins: la fecha en la que un socio vino por última vez no es algo que otro
-- socio deba poder consultar.
CREATE OR REPLACE FUNCTION public.last_attendance_bulk(p_user_ids uuid[])
RETURNS TABLE (user_id uuid, last_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
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
    AND (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid' < now()
  GROUP BY b.user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.last_attendance_bulk(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.last_attendance_bulk(uuid[]) TO authenticated;
