-- Más variabilidad en el panel de notificaciones (ver
-- src/screens/AdminNotificationsScreen.tsx):
--
-- 1) El admin puede crear automáticas de 3 tipos nuevos además de
--    'inactivity' (días desde el alta, cumpleaños, bono a punto de
--    caducar) eligiendo el tipo y el número de días de una lista cerrada
--    — nunca texto libre ejecutado contra la base de datos.
-- 2) Placeholders {{nombre}}/{{apodo}}/{{plan}} interpolados por
--    destinatario, tanto en plantillas manuales como automáticas.
-- 3) Icono por plantilla, copiado a la notificación al enviarla (igual que
--    título/mensaje) para que la lista del socio lo pinte sin joins.

ALTER TABLE public.notification_templates
  ADD COLUMN icon_key text NOT NULL DEFAULT 'bell'
    CHECK (icon_key IN ('bell','calendar','hourglass','clock','credit-card','barbell','shield','user'));

ALTER TABLE public.notification_templates
  DROP CONSTRAINT notification_templates_trigger_kind_check;
ALTER TABLE public.notification_templates
  ADD CONSTRAINT notification_templates_trigger_kind_check
    CHECK (trigger_kind IN ('manual','inactivity','payment_due','payment_blocked','birthday','signup_anniversary','bono_expiring'));

ALTER TABLE public.notification_templates
  DROP CONSTRAINT notification_templates_check;
ALTER TABLE public.notification_templates
  ADD CONSTRAINT notification_templates_check
    CHECK (trigger_kind NOT IN ('inactivity','payment_blocked','birthday','signup_anniversary','bono_expiring') OR offset_days IS NOT NULL);

ALTER TABLE public.notifications ADD COLUMN icon_key text;

-- ----------------------------------------------------------------------------
-- notify_inactive_members() se generaliza a run_notification_rules(): en vez
-- de un único trigger_kind fijo, recorre las 4 reglas admin-creables. El
-- dedupe cambia según el tipo porque su "recurrencia natural" es distinta:
--   inactivity        → una vez por ventana de offset_days (como ya hacía)
--   signup_anniversary→ una sola vez en la vida del socio (hito, no se repite)
--   birthday          → una vez al año (dedupe de ~350 días)
--   bono_expiring     → una vez por bono asignado (dedupe desde plan_assigned_at)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.notify_inactive_members();

CREATE OR REPLACE FUNCTION public.run_notification_rules()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_regla record; v_socio record; v_tokens text[]; v_n int := 0;
  v_titulo text; v_cuerpo text; v_bday_month int; v_bday_day int; v_next_bday date;
BEGIN
  -- ── inactivity ────────────────────────────────────────────────────────
  FOR v_regla IN
    SELECT id, offset_days, title, message, icon_key
    FROM public.notification_templates WHERE trigger_kind = 'inactivity' AND enabled
  LOOP
    FOR v_socio IN
      SELECT p.id, p.full_name, p.username, mp.name AS plan_name
      FROM public.profiles p
      JOIN public.membership_plans mp ON mp.id = p.plan_id
      WHERE mp.is_active
        AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin')
        AND COALESCE(public.last_attendance(p.id), p.plan_assigned_at, p.created_at) < now() - (v_regla.offset_days || ' days')::interval
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = p.id AND n.template_id = v_regla.id
            AND n.created_at > now() - (v_regla.offset_days || ' days')::interval
        )
    LOOP
      v_titulo := v_regla.title;
      v_cuerpo := replace(replace(replace(v_regla.message,
        '{{nombre}}', v_socio.full_name), '{{apodo}}', COALESCE(v_socio.username, v_socio.full_name)), '{{plan}}', COALESCE(v_socio.plan_name, ''));
      INSERT INTO public.notifications (user_id, type, title, message, template_id, icon_key)
      VALUES (v_socio.id, 'inactivity_nudge', v_titulo, v_cuerpo, v_regla.id, v_regla.icon_key);
      SELECT array_agg(token) INTO v_tokens FROM public.push_tokens WHERE user_id = v_socio.id;
      IF v_tokens IS NOT NULL THEN
        PERFORM net.http_post(url := 'https://exp.host/--/api/v2/push/send',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := (SELECT jsonb_agg(jsonb_build_object('to', t, 'sound', 'default', 'title', v_titulo, 'body', v_cuerpo)) FROM unnest(v_tokens) AS t));
      END IF;
      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  -- ── signup_anniversary (one-shot de por vida) ───────────────────────────
  FOR v_regla IN
    SELECT id, offset_days, title, message, icon_key
    FROM public.notification_templates WHERE trigger_kind = 'signup_anniversary' AND enabled
  LOOP
    FOR v_socio IN
      SELECT p.id, p.full_name, p.username, mp.name AS plan_name
      FROM public.profiles p
      LEFT JOIN public.membership_plans mp ON mp.id = p.plan_id
      WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin')
        AND now() - p.created_at >= (v_regla.offset_days || ' days')::interval
        AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = p.id AND n.template_id = v_regla.id)
    LOOP
      v_titulo := v_regla.title;
      v_cuerpo := replace(replace(replace(v_regla.message,
        '{{nombre}}', v_socio.full_name), '{{apodo}}', COALESCE(v_socio.username, v_socio.full_name)), '{{plan}}', COALESCE(v_socio.plan_name, ''));
      INSERT INTO public.notifications (user_id, type, title, message, template_id, icon_key)
      VALUES (v_socio.id, 'admin_message', v_titulo, v_cuerpo, v_regla.id, v_regla.icon_key);
      SELECT array_agg(token) INTO v_tokens FROM public.push_tokens WHERE user_id = v_socio.id;
      IF v_tokens IS NOT NULL THEN
        PERFORM net.http_post(url := 'https://exp.host/--/api/v2/push/send',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := (SELECT jsonb_agg(jsonb_build_object('to', t, 'sound', 'default', 'title', v_titulo, 'body', v_cuerpo)) FROM unnest(v_tokens) AS t));
      END IF;
      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  -- ── birthday (una vez al año) ────────────────────────────────────────
  FOR v_regla IN
    SELECT id, offset_days, title, message, icon_key
    FROM public.notification_templates WHERE trigger_kind = 'birthday' AND enabled
  LOOP
    FOR v_socio IN
      SELECT p.id, p.full_name, p.username, p.birth_date, mp.name AS plan_name
      FROM public.profiles p
      LEFT JOIN public.membership_plans mp ON mp.id = p.plan_id
      WHERE p.birth_date IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin')
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = p.id AND n.template_id = v_regla.id AND n.created_at > now() - interval '350 days'
        )
    LOOP
      v_bday_month := extract(month FROM v_socio.birth_date)::int;
      v_bday_day := extract(day FROM v_socio.birth_date)::int;
      -- 29 de febrero en año no bisiesto: se celebra el 28, no falla make_date.
      v_next_bday := make_date(extract(year FROM CURRENT_DATE)::int, v_bday_month,
        CASE WHEN v_bday_month = 2 AND v_bday_day = 29 THEN LEAST(v_bday_day, 28) ELSE v_bday_day END);
      IF v_next_bday < CURRENT_DATE THEN v_next_bday := v_next_bday + interval '1 year'; END IF;

      IF (v_next_bday - CURRENT_DATE) <= v_regla.offset_days THEN
        v_titulo := v_regla.title;
        v_cuerpo := replace(replace(replace(v_regla.message,
          '{{nombre}}', v_socio.full_name), '{{apodo}}', COALESCE(v_socio.username, v_socio.full_name)), '{{plan}}', COALESCE(v_socio.plan_name, ''));
        INSERT INTO public.notifications (user_id, type, title, message, template_id, icon_key)
        VALUES (v_socio.id, 'admin_message', v_titulo, v_cuerpo, v_regla.id, v_regla.icon_key);
        SELECT array_agg(token) INTO v_tokens FROM public.push_tokens WHERE user_id = v_socio.id;
        IF v_tokens IS NOT NULL THEN
          PERFORM net.http_post(url := 'https://exp.host/--/api/v2/push/send',
            headers := jsonb_build_object('Content-Type', 'application/json'),
            body := (SELECT jsonb_agg(jsonb_build_object('to', t, 'sound', 'default', 'title', v_titulo, 'body', v_cuerpo)) FROM unnest(v_tokens) AS t));
        END IF;
        v_n := v_n + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- ── bono_expiring (una vez por bono asignado) ───────────────────────────
  FOR v_regla IN
    SELECT id, offset_days, title, message, icon_key
    FROM public.notification_templates WHERE trigger_kind = 'bono_expiring' AND enabled
  LOOP
    FOR v_socio IN
      SELECT p.id, p.full_name, p.username, p.plan_assigned_at, mp.name AS plan_name, mp.validity_days
      FROM public.profiles p
      JOIN public.membership_plans mp ON mp.id = p.plan_id
      WHERE mp.billing_period = 'once' AND mp.is_active
        AND p.plan_assigned_at IS NOT NULL AND mp.validity_days IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin')
        AND (p.plan_assigned_at::date + (mp.validity_days || ' days')::interval - CURRENT_DATE) BETWEEN 0 AND v_regla.offset_days
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = p.id AND n.template_id = v_regla.id AND n.created_at > p.plan_assigned_at
        )
    LOOP
      v_titulo := v_regla.title;
      v_cuerpo := replace(replace(replace(v_regla.message,
        '{{nombre}}', v_socio.full_name), '{{apodo}}', COALESCE(v_socio.username, v_socio.full_name)), '{{plan}}', COALESCE(v_socio.plan_name, ''));
      INSERT INTO public.notifications (user_id, type, title, message, template_id, icon_key)
      VALUES (v_socio.id, 'admin_message', v_titulo, v_cuerpo, v_regla.id, v_regla.icon_key);
      SELECT array_agg(token) INTO v_tokens FROM public.push_tokens WHERE user_id = v_socio.id;
      IF v_tokens IS NOT NULL THEN
        PERFORM net.http_post(url := 'https://exp.host/--/api/v2/push/send',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body := (SELECT jsonb_agg(jsonb_build_object('to', t, 'sound', 'default', 'title', v_titulo, 'body', v_cuerpo)) FROM unnest(v_tokens) AS t));
      END IF;
      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  RETURN v_n;
END $$;

REVOKE EXECUTE ON FUNCTION public.run_notification_rules() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('inactivity-nudge-daily');
SELECT cron.schedule(
  'notification-rules-daily',
  '0 10 * * *',
  $cron$ SELECT public.run_notification_rules(); $cron$
);

-- El icon_key por defecto ('bell') es correcto para 'inactivity' (ya caía en
-- BellIcon como fallback por type), pero las de pago mostraban CreditCardIcon
-- vía ese mismo fallback — hay que fijarlo explícitamente para no perder el
-- icono ahora que notifications.icon_key empieza a mandar sobre el type.
UPDATE public.notification_templates SET icon_key = 'credit-card' WHERE key IN ('payment_due', 'payment_blocked');
