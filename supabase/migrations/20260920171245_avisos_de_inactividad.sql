-- ============================================================================
-- AVISOS DE INACTIVIDAD
--
-- Si un socio lleva tiempo sin pisar el gimnasio, se le manda un empujón.
-- Todo esto vive en el backend: no hay pantalla ni contador visible.
--
-- ── Qué cuenta como asistencia ──────────────────────────────────────────────
-- Una reserva que SIGUE EXISTIENDO cuando la clase ya ha pasado. No hace
-- falta una tabla de asistencias: si el socio se borró, la fila desapareció;
-- si le borró el profesor, también. Los dos casos que había que excluir se
-- excluyen solos.
--
-- Límite conocido: quien reserva y no aparece, y nadie le quita la reserva,
-- cuenta como asistente. Sin control de entrada no hay forma de distinguirlo.
--
-- ── Desde cuándo se cuenta ──────────────────────────────────────────────────
-- Para quien nunca ha venido no vale medir desde su última asistencia, porque
-- no la hay. Se mide desde que se le asignó el plan (o desde su alta). Si no,
-- un socio dado de alta ayer recibiría el aviso el primer día.
-- ============================================================================

INSERT INTO public.app_settings (key, value) VALUES ('inactivity_days', '15')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.app_settings (key, value) VALUES ('inactivity_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Última asistencia de un socio. Expuesta como función para que la definición
-- de "asistencia" viva en un solo sitio.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.last_attendance(p_user_id uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT max((c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid')
  FROM public.bookings b
  JOIN public.classes c ON c.id = b.class_id
  WHERE b.user_id = p_user_id
    AND (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid' < now();
$$;

REVOKE EXECUTE ON FUNCTION public.last_attendance(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.last_attendance(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- El aviso en sí. Devuelve a cuántos socios ha avisado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_inactive_members()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_dias int; v_activo text; v_socio record; v_tokens text[]; v_n int := 0;
  v_titulo text := 'Te echamos de menos';
  v_cuerpo text := 'Ánimo, compañero: llevamos mucho tiempo sin verte por La Nave. ¡Te esperamos!';
BEGIN
  SELECT value INTO v_activo FROM public.app_settings WHERE key = 'inactivity_enabled';
  IF COALESCE(v_activo, 'false') <> 'true' THEN RETURN 0; END IF;

  SELECT COALESCE(value::int, 15) INTO v_dias FROM public.app_settings WHERE key = 'inactivity_days';
  v_dias := COALESCE(v_dias, 15);

  FOR v_socio IN
    SELECT p.id
    FROM public.profiles p
    JOIN public.membership_plans mp ON mp.id = p.plan_id
    WHERE mp.is_active
      -- El admin no necesita que le animen a venir.
      AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin')
      AND COALESCE(
            public.last_attendance(p.id),
            p.plan_assigned_at,
            p.created_at
          ) < now() - (v_dias || ' days')::interval
      -- Una vez cada ventana: el que lleva tres meses sin venir no debe
      -- recibir el mismo mensaje cada mañana.
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = p.id
          AND n.type = 'inactivity_nudge'
          AND n.created_at > now() - (v_dias || ' days')::interval
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message)
    VALUES (v_socio.id, 'inactivity_nudge', v_titulo, v_cuerpo);

    SELECT array_agg(token) INTO v_tokens
      FROM public.push_tokens WHERE user_id = v_socio.id;

    IF v_tokens IS NOT NULL THEN
      PERFORM net.http_post(
        url     := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := (SELECT jsonb_agg(jsonb_build_object(
                      'to', t, 'sound', 'default', 'title', v_titulo, 'body', v_cuerpo))
                    FROM unnest(v_tokens) AS t)
      );
    END IF;

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END $$;

REVOKE EXECUTE ON FUNCTION public.notify_inactive_members() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Una vez al día. A las 10:00 UTC para no pisarse con payment-reminders
-- (09:00), que también manda push.
-- ----------------------------------------------------------------------------
SELECT cron.schedule(
  'inactivity-nudge-daily',
  '0 10 * * *',
  $cron$ SELECT public.notify_inactive_members(); $cron$
);
