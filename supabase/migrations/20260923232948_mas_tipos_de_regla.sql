-- Amplía el catálogo de tipos de evento admin-creables de 4 a 9, para que el
-- admin tenga de sobra sin tener que pedir un tipo nuevo cada vez. Mismo
-- patrón seguro de siempre: campo de una lista cerrada + número (días, o
-- clases restantes en el caso de quota_low) — nunca texto libre ejecutado.
--
-- Nuevos:
--   no_plan_assigned    — días desde el alta sin plan asignado (una vez)
--   no_booking_template — días desde el plan sin plantilla semanal (una vez)
--   no_avatar           — días desde el alta sin foto de perfil (una vez)
--   no_workout_logs     — días sin registrar un entreno (recurrente, como inactivity)
--   quota_low           — le quedan N clases o menos en su periodo/bono (recurrente por ventana)

ALTER TABLE public.notification_templates
  DROP CONSTRAINT notification_templates_trigger_kind_check;
ALTER TABLE public.notification_templates
  ADD CONSTRAINT notification_templates_trigger_kind_check
    CHECK (trigger_kind IN (
      'manual','inactivity','payment_due','payment_blocked','birthday','signup_anniversary','bono_expiring',
      'no_plan_assigned','no_booking_template','no_avatar','no_workout_logs','quota_low'
    ));

-- Simplificada a lista de excepciones: con 10 trigger_kind que sí necesitan
-- offset_days era más fácil de leer/mantener que la lista de los que sí.
ALTER TABLE public.notification_templates
  DROP CONSTRAINT notification_templates_check;
ALTER TABLE public.notification_templates
  ADD CONSTRAINT notification_templates_check
    CHECK (trigger_kind IN ('manual', 'payment_due') OR offset_days IS NOT NULL);

-- ----------------------------------------------------------------------------
-- Helper compartido: insertar + mandar push. Antes cada rama del bucle
-- repetía este bloque entero (9 veces con los tipos nuevos habría sido
-- insostenible) — se extrae una vez.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._notify_and_push(
  p_user_id uuid, p_type text, p_title text, p_message text, p_template_id uuid, p_icon_key text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_tokens text[];
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, template_id, icon_key)
  VALUES (p_user_id, p_type, p_title, p_message, p_template_id, p_icon_key);

  SELECT array_agg(token) INTO v_tokens FROM public.push_tokens WHERE user_id = p_user_id;
  IF v_tokens IS NOT NULL THEN
    PERFORM net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := (SELECT jsonb_agg(jsonb_build_object('to', t, 'sound', 'default', 'title', p_title, 'body', p_message))
                  FROM unnest(v_tokens) AS t)
    );
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public._notify_and_push(uuid, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- run_notification_rules(): las 4 ramas de siempre reescritas para usar el
-- helper, más las 5 ramas nuevas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_notification_rules()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_regla record; v_socio record; v_n int := 0;
  v_titulo text; v_cuerpo text; v_bday_month int; v_bday_day int; v_next_bday date;
  v_q_period_start date; v_q_period_end date; v_q_months int; v_q_total int; v_q_used int; v_q_remaining boolean;
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
      v_cuerpo := replace(replace(replace(v_regla.message, '{{nombre}}', v_socio.full_name),
        '{{apodo}}', COALESCE(v_socio.username, v_socio.full_name)), '{{plan}}', COALESCE(v_socio.plan_name, ''));
      PERFORM public._notify_and_push(v_socio.id, 'inactivity_nudge', v_titulo, v_cuerpo, v_regla.id, v_regla.icon_key);
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
      v_cuerpo := replace(replace(replace(v_regla.message, '{{nombre}}', v_socio.full_name),
        '{{apodo}}', COALESCE(v_socio.username, v_socio.full_name)), '{{plan}}', COALESCE(v_socio.plan_name, ''));
      PERFORM public._notify_and_push(v_socio.id, 'admin_message', v_titulo, v_cuerpo, v_regla.id, v_regla.icon_key);
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
      v_next_bday := make_date(extract(year FROM CURRENT_DATE)::int, v_bday_month,
        CASE WHEN v_bday_month = 2 AND v_bday_day = 29 THEN LEAST(v_bday_day, 28) ELSE v_bday_day END);
      IF v_next_bday < CURRENT_DATE THEN v_next_bday := v_next_bday + interval '1 year'; END IF;

      IF (v_next_bday - CURRENT_DATE) <= v_regla.offset_days THEN
        v_titulo := v_regla.title;
        v_cuerpo := replace(replace(replace(v_regla.message, '{{nombre}}', v_socio.full_name),
          '{{apodo}}', COALESCE(v_socio.username, v_socio.full_name)), '{{plan}}', COALESCE(v_socio.plan_name, ''));
        PERFORM public._notify_and_push(v_socio.id, 'admin_message', v_titulo, v_cuerpo, v_regla.id, v_regla.icon_key);
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
      v_cuerpo := replace(replace(replace(v_regla.message, '{{nombre}}', v_socio.full_name),
        '{{apodo}}', COALESCE(v_socio.username, v_socio.full_name)), '{{plan}}', COALESCE(v_socio.plan_name, ''));
      PERFORM public._notify_and_push(v_socio.id, 'admin_message', v_titulo, v_cuerpo, v_regla.id, v_regla.icon_key);
      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  -- ── no_plan_assigned (one-shot) ──────────────────────────────────────
  FOR v_regla IN
    SELECT id, offset_days, title, message, icon_key
    FROM public.notification_templates WHERE trigger_kind = 'no_plan_assigned' AND enabled
  LOOP
    FOR v_socio IN
      SELECT p.id, p.full_name, p.username
      FROM public.profiles p
      WHERE p.plan_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin')
        AND now() - p.created_at >= (v_regla.offset_days || ' days')::interval
        AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = p.id AND n.template_id = v_regla.id)
    LOOP
      v_titulo := v_regla.title;
      v_cuerpo := replace(replace(v_regla.message, '{{nombre}}', v_socio.full_name),
        '{{apodo}}', COALESCE(v_socio.username, v_socio.full_name));
      PERFORM public._notify_and_push(v_socio.id, 'admin_message', v_titulo, v_cuerpo, v_regla.id, v_regla.icon_key);
      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  -- ── no_booking_template (one-shot) ───────────────────────────────────
  FOR v_regla IN
    SELECT id, offset_days, title, message, icon_key
    FROM public.notification_templates WHERE trigger_kind = 'no_booking_template' AND enabled
  LOOP
    FOR v_socio IN
      SELECT p.id, p.full_name, p.username, mp.name AS plan_name
      FROM public.profiles p
      JOIN public.membership_plans mp ON mp.id = p.plan_id
      WHERE mp.is_active AND NOT p.template_not_required
        AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin')
        AND now() - COALESCE(p.plan_assigned_at, p.created_at) >= (v_regla.offset_days || ' days')::interval
        AND NOT EXISTS (SELECT 1 FROM public.booking_templates bt WHERE bt.user_id = p.id AND bt.is_active)
        AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = p.id AND n.template_id = v_regla.id)
    LOOP
      v_titulo := v_regla.title;
      v_cuerpo := replace(replace(replace(v_regla.message, '{{nombre}}', v_socio.full_name),
        '{{apodo}}', COALESCE(v_socio.username, v_socio.full_name)), '{{plan}}', COALESCE(v_socio.plan_name, ''));
      PERFORM public._notify_and_push(v_socio.id, 'admin_message', v_titulo, v_cuerpo, v_regla.id, v_regla.icon_key);
      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  -- ── no_avatar (one-shot) ─────────────────────────────────────────────
  FOR v_regla IN
    SELECT id, offset_days, title, message, icon_key
    FROM public.notification_templates WHERE trigger_kind = 'no_avatar' AND enabled
  LOOP
    FOR v_socio IN
      SELECT p.id, p.full_name, p.username, mp.name AS plan_name
      FROM public.profiles p
      LEFT JOIN public.membership_plans mp ON mp.id = p.plan_id
      WHERE p.avatar_url IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin')
        AND now() - p.created_at >= (v_regla.offset_days || ' days')::interval
        AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.user_id = p.id AND n.template_id = v_regla.id)
    LOOP
      v_titulo := v_regla.title;
      v_cuerpo := replace(replace(replace(v_regla.message, '{{nombre}}', v_socio.full_name),
        '{{apodo}}', COALESCE(v_socio.username, v_socio.full_name)), '{{plan}}', COALESCE(v_socio.plan_name, ''));
      PERFORM public._notify_and_push(v_socio.id, 'admin_message', v_titulo, v_cuerpo, v_regla.id, v_regla.icon_key);
      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  -- ── no_workout_logs (recurrente, igual que inactivity pero mirando el
  --    diario de entreno en vez de las reservas de clase) ────────────────
  FOR v_regla IN
    SELECT id, offset_days, title, message, icon_key
    FROM public.notification_templates WHERE trigger_kind = 'no_workout_logs' AND enabled
  LOOP
    FOR v_socio IN
      SELECT p.id, p.full_name, p.username, mp.name AS plan_name
      FROM public.profiles p
      JOIN public.membership_plans mp ON mp.id = p.plan_id
      WHERE mp.is_active
        AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin')
        AND COALESCE(
              (SELECT max(wl.date) FROM public.workout_logs wl WHERE wl.user_id = p.id),
              p.plan_assigned_at::date,
              p.created_at::date
            ) < (now() - (v_regla.offset_days || ' days')::interval)::date
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = p.id AND n.template_id = v_regla.id
            AND n.created_at > now() - (v_regla.offset_days || ' days')::interval
        )
    LOOP
      v_titulo := v_regla.title;
      v_cuerpo := replace(replace(replace(v_regla.message, '{{nombre}}', v_socio.full_name),
        '{{apodo}}', COALESCE(v_socio.username, v_socio.full_name)), '{{plan}}', COALESCE(v_socio.plan_name, ''));
      PERFORM public._notify_and_push(v_socio.id, 'admin_message', v_titulo, v_cuerpo, v_regla.id, v_regla.icon_key);
      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  -- ── quota_low: le quedan offset_days clases o menos (aquí offset_days es
  --    un nº de CLASES, no de días — mismo campo, distinta unidad según el
  --    tipo, ya con su propia etiqueta en el UI). Recalcula la ventana de
  --    cupo igual que can_user_book()/getClassQuotaStatusBulk (bono vs
  --    recurrente), y sólo avisa una vez por ventana vigente. ──────────────
  FOR v_regla IN
    SELECT id, offset_days, title, message, icon_key
    FROM public.notification_templates WHERE trigger_kind = 'quota_low' AND enabled
  LOOP
    FOR v_socio IN
      SELECT p.id, p.full_name, p.username, p.plan_assigned_at,
             mp.name AS plan_name, mp.billing_period, mp.classes_per_month, mp.validity_days
      FROM public.profiles p
      JOIN public.membership_plans mp ON mp.id = p.plan_id
      WHERE mp.is_active AND mp.classes_per_month IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin')
    LOOP
      IF v_socio.billing_period = 'once' THEN
        IF v_socio.plan_assigned_at IS NULL OR v_socio.validity_days IS NULL THEN CONTINUE; END IF;
        v_q_period_start := v_socio.plan_assigned_at::date;
        v_q_period_end := v_q_period_start + (v_socio.validity_days || ' days')::interval;
        IF now() >= v_q_period_end THEN CONTINUE; END IF;
        v_q_total := v_socio.classes_per_month;
      ELSE
        v_q_months := CASE v_socio.billing_period WHEN 'yearly' THEN 12 WHEN 'quarterly' THEN 3 ELSE 1 END;
        v_q_period_start := date_trunc(CASE v_socio.billing_period WHEN 'yearly' THEN 'year' WHEN 'quarterly' THEN 'quarter' ELSE 'month' END, now())::date;
        v_q_period_end := (v_q_period_start + (v_q_months || ' months')::interval)::date;
        v_q_total := v_socio.classes_per_month * v_q_months;
      END IF;

      SELECT count(*) INTO v_q_used FROM public.bookings b JOIN public.classes c ON c.id = b.class_id
        WHERE b.user_id = v_socio.id AND c.class_date >= v_q_period_start AND c.class_date < v_q_period_end;
      SELECT v_q_used + COALESCE(sum(pa.used_delta), 0) INTO v_q_used
        FROM public.plan_adjustments pa WHERE pa.user_id = v_socio.id AND pa.period_start = v_q_period_start;

      v_q_remaining := (v_q_total - v_q_used) <= v_regla.offset_days AND (v_q_total - v_q_used) >= 0;

      IF v_q_remaining AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = v_socio.id AND n.template_id = v_regla.id AND n.created_at > v_q_period_start
      ) THEN
        v_titulo := v_regla.title;
        v_cuerpo := replace(replace(replace(v_regla.message, '{{nombre}}', v_socio.full_name),
          '{{apodo}}', COALESCE(v_socio.username, v_socio.full_name)), '{{plan}}', COALESCE(v_socio.plan_name, ''));
        PERFORM public._notify_and_push(v_socio.id, 'admin_message', v_titulo, v_cuerpo, v_regla.id, v_regla.icon_key);
        v_n := v_n + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_n;
END $$;

REVOKE EXECUTE ON FUNCTION public.run_notification_rules() FROM PUBLIC, anon, authenticated;
