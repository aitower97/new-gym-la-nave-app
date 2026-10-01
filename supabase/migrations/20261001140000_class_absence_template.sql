-- El aviso de "no vino" (asistencia ✗) pasa a ser una regla de serie del panel
-- de Notificaciones: el admin edita título, texto e icono, o la apaga.
-- Variables propias: {{clase}} y {{hora}}, además de {{nombre}}, {{apodo}} y {{plan}}.
-- Apagada = se sigue marcando la asistencia, pero no se avisa a nadie.

ALTER TABLE public.notification_templates DROP CONSTRAINT notification_templates_trigger_kind_check;
ALTER TABLE public.notification_templates ADD CONSTRAINT notification_templates_trigger_kind_check
  CHECK (trigger_kind = ANY (ARRAY['manual', 'inactivity', 'payment_due', 'payment_blocked', 'birthday',
    'signup_anniversary', 'bono_expiring', 'no_plan_assigned', 'no_booking_template', 'no_avatar',
    'no_workout_logs', 'quota_low', 'class_absence']));

-- Las que salen por un evento, no por un número de días
ALTER TABLE public.notification_templates DROP CONSTRAINT notification_templates_check;
ALTER TABLE public.notification_templates ADD CONSTRAINT notification_templates_check
  CHECK (trigger_kind = ANY (ARRAY['manual', 'payment_due', 'class_absence']) OR offset_days IS NOT NULL);

INSERT INTO public.notification_templates (key, trigger_kind, offset_days, enabled, title, message, icon_key)
VALUES ('class_absence', 'class_absence', NULL, true, 'No te vimos en clase',
        '{{clase}}, {{hora}}. Si no vas a venir, cancela y deja la plaza libre.', 'calendar')
ON CONFLICT (key) DO NOTHING;

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
  v_tpl record;
  v_socio record;
  v_title text;
  v_body text;
  v_tokens text[];
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
    SELECT id, title, message, icon_key INTO v_tpl
    FROM public.notification_templates WHERE key = 'class_absence' AND enabled;

    IF FOUND THEN
      SELECT p.full_name, p.username, mp.name AS plan_name INTO v_socio
      FROM public.profiles p LEFT JOIN public.membership_plans mp ON mp.id = p.plan_id
      WHERE p.id = v_booking.user_id;

      v_title := v_tpl.title;
      v_body := replace(replace(replace(replace(replace(v_tpl.message,
        '{{clase}}', v_class.name),
        '{{hora}}', to_char(v_class.class_time, 'HH24:MI')),
        '{{nombre}}', COALESCE(v_socio.full_name, '')),
        '{{apodo}}', COALESCE(v_socio.username, v_socio.full_name, '')),
        '{{plan}}', COALESCE(v_socio.plan_name, ''));

      INSERT INTO public.notifications (user_id, type, title, message, class_id, template_id, icon_key)
      VALUES (v_booking.user_id, 'class_absence', v_title, v_body, v_class.id, v_tpl.id, v_tpl.icon_key);

      SELECT array_agg(token) INTO v_tokens FROM public.push_tokens WHERE user_id = v_booking.user_id;
      IF v_tokens IS NOT NULL THEN
        PERFORM net.http_post(
          url     := 'https://exp.host/--/api/v2/push/send',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body    := (SELECT jsonb_agg(jsonb_build_object(
                        'to', t, 'sound', 'default', 'title', v_title, 'body', v_body,
                        'data', jsonb_build_object('classId', v_class.id::text, 'type', 'class_absence')))
                      FROM unnest(v_tokens) AS t)
        );
      END IF;

      UPDATE public.bookings SET absence_notified_at = now() WHERE id = p_booking_id;
    END IF;
  END IF;

  RETURN 'ok';
END $$;

REVOKE ALL ON FUNCTION public.set_attendance(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_attendance(uuid, boolean) TO authenticated;
