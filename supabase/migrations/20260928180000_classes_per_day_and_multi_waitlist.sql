-- Varias clases por día y varias listas de espera.
--
-- 1) Máximo de clases por día configurable (app_settings.max_classes_per_day,
--    por defecto 2; antes era 1 impuesto solo por la app). can_user_book lo
--    hace cumplir en la base de datos.
-- 2) Se puede estar en varias listas de espera a la vez (antes, una sola:
--    caso real, Alba no podía entrar en la cola de hoy por estar en la de
--    mañana).
-- 3) class_waitlist.keep_both: al apuntarse teniendo otra clase ese día, el
--    socio elige si al entrar se le CAMBIA (false, lo de siempre) o hace las
--    DOS (true). Las versiones instaladas no preguntan y dejan false: se
--    sigue entendiendo como cambio, como hasta ahora.

INSERT INTO public.app_settings (key, value) VALUES ('max_classes_per_day', '2')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.max_classes_per_day()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT GREATEST(1, COALESCE((SELECT value::int FROM public.app_settings WHERE key = 'max_classes_per_day'), 2));
$function$;

GRANT EXECUTE ON FUNCTION public.max_classes_per_day() TO authenticated;

ALTER TABLE public.class_waitlist ADD COLUMN IF NOT EXISTS keep_both boolean NOT NULL DEFAULT false;

-- can_user_book: igual que antes + límite de clases por día
CREATE OR REPLACE FUNCTION public.can_user_book(p_user_id uuid, p_class_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_id uuid; v_is_active boolean; v_billing_period text;
  v_classes_per_month int; v_validity_days int; v_plan_assigned_at date;
  v_period_start date; v_period_months int; v_period_end date;
  v_paid boolean; v_count int; v_class_datetime timestamptz; v_cutoff_hours int;
  v_created_at_date date; v_prev_period_start date; v_prev_paid boolean;
  v_trial_used timestamptz; v_trial_enabled text; v_is_trial boolean := false;
  v_adjust int; v_class_date date; v_same_day int;
BEGIN
  SELECT plan_id, created_at::date, plan_assigned_at::date, free_trial_used_at
    INTO v_plan_id, v_created_at_date, v_plan_assigned_at, v_trial_used
    FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_plan_id IS NULL THEN
    SELECT value INTO v_trial_enabled FROM public.app_settings WHERE key = 'free_trial_enabled';
    IF COALESCE(v_trial_enabled, 'false') <> 'true' THEN RETURN false; END IF;
    IF v_trial_used IS NOT NULL THEN RETURN false; END IF;
    v_is_trial := true;
  END IF;

  IF NOT v_is_trial THEN
    SELECT is_active, billing_period, classes_per_month, validity_days
      INTO v_is_active, v_billing_period, v_classes_per_month, v_validity_days
      FROM public.membership_plans WHERE id = v_plan_id;
    IF NOT FOUND OR NOT v_is_active THEN RETURN false; END IF;

    IF v_billing_period = 'once' THEN
      IF v_plan_assigned_at IS NULL OR v_validity_days IS NULL THEN RETURN false; END IF;
      v_period_start := v_plan_assigned_at;
      v_period_end := v_plan_assigned_at + (v_validity_days || ' days')::interval;
      IF now() >= v_period_end THEN RETURN false; END IF;
      IF v_classes_per_month IS NOT NULL THEN
        SELECT count(*) INTO v_count FROM public.bookings b JOIN public.classes c ON c.id = b.class_id
          WHERE b.user_id = p_user_id AND c.class_date >= v_period_start AND c.class_date < v_period_end;
        SELECT COALESCE(sum(used_delta), 0) INTO v_adjust FROM public.plan_adjustments
          WHERE user_id = p_user_id AND period_start = v_period_start;
        IF (v_count + v_adjust) >= v_classes_per_month THEN RETURN false; END IF;
      END IF;
    ELSE
      v_period_months := CASE v_billing_period WHEN 'yearly' THEN 12 WHEN 'quarterly' THEN 3 ELSE 1 END;
      v_period_start := date_trunc(CASE v_billing_period WHEN 'yearly' THEN 'year' WHEN 'quarterly' THEN 'quarter' ELSE 'month' END, now())::date;
      v_period_end := (v_period_start + (v_period_months || ' months')::interval)::date;
      IF v_billing_period <> 'daily' THEN
        SELECT EXISTS(SELECT 1 FROM public.plan_payments WHERE user_id = p_user_id AND period_start = v_period_start) INTO v_paid;
        IF NOT v_paid THEN
          IF CURRENT_DATE >= (v_period_start + 4) THEN RETURN false; END IF;
          v_prev_period_start := (CASE v_billing_period WHEN 'yearly' THEN v_period_start - interval '1 year'
            WHEN 'quarterly' THEN v_period_start - interval '3 months' ELSE v_period_start - interval '1 month' END)::date;
          IF v_created_at_date IS NOT NULL AND v_created_at_date <= v_prev_period_start THEN
            SELECT EXISTS(SELECT 1 FROM public.plan_payments WHERE user_id = p_user_id AND period_start = v_prev_period_start) INTO v_prev_paid;
            IF NOT v_prev_paid THEN RETURN false; END IF;
          END IF;
        END IF;
      END IF;
      IF v_classes_per_month IS NOT NULL THEN
        SELECT count(*) INTO v_count FROM public.bookings b JOIN public.classes c ON c.id = b.class_id
          WHERE b.user_id = p_user_id AND c.class_date >= v_period_start AND c.class_date < v_period_end;
        SELECT COALESCE(sum(used_delta), 0) INTO v_adjust FROM public.plan_adjustments
          WHERE user_id = p_user_id AND period_start = v_period_start;
        IF (v_count + v_adjust) >= (v_classes_per_month * v_period_months) THEN RETURN false; END IF;
      END IF;
    END IF;
  END IF;

  SELECT (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid', c.class_date
    INTO v_class_datetime, v_class_date
    FROM public.classes c WHERE c.id = p_class_id;

  -- Máximo de clases por día (sin contar esta misma clase)
  IF v_class_date IS NOT NULL THEN
    SELECT count(*) INTO v_same_day FROM public.bookings b JOIN public.classes c ON c.id = b.class_id
      WHERE b.user_id = p_user_id AND b.class_id <> p_class_id AND c.class_date = v_class_date;
    IF v_same_day >= public.max_classes_per_day() THEN RETURN false; END IF;
  END IF;

  IF v_class_datetime IS NOT NULL THEN
    SELECT COALESCE(value::int, 48) INTO v_cutoff_hours FROM public.app_settings WHERE key = 'booking_cutoff_hours';
    IF now() < v_class_datetime - (COALESCE(v_cutoff_hours, 48) || ' hours')::interval THEN RETURN false; END IF;
  END IF;

  RETURN true;
END;
$function$;

-- can_join_waitlist: sin "una lista a la vez"
CREATE OR REPLACE FUNCTION public.can_join_waitlist(p_user_id uuid, p_class_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_when timestamptz; v_max int; v_ocupadas int;
BEGIN
  -- Las cuentas demo no hacen cola: no le quitan el turno a un socio.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND is_demo) THEN
    RETURN false;
  END IF;

  SELECT (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid', c.max_spots
    INTO v_when, v_max
    FROM public.classes c WHERE c.id = p_class_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Mismo margen que la promoción: apuntarse a algo que ya no se va a poder
  -- promocionar solo genera falsas esperanzas.
  IF v_when <= now() + interval '2 hours' THEN RETURN false; END IF;

  -- La lista solo tiene sentido si está llena (las cuentas demo no ocupan plaza).
  SELECT count(*) INTO v_ocupadas
    FROM public.bookings b JOIN public.profiles p ON p.id = b.user_id
    WHERE b.class_id = p_class_id AND NOT p.is_demo;
  IF v_ocupadas < v_max THEN RETURN false; END IF;

  -- Ni si ya tiene plaza en ella.
  IF EXISTS (SELECT 1 FROM public.bookings WHERE class_id = p_class_id AND user_id = p_user_id) THEN
    RETURN false;
  END IF;

  -- Ni si ya está en esta misma cola.
  IF EXISTS (SELECT 1 FROM public.class_waitlist WHERE class_id = p_class_id AND user_id = p_user_id) THEN
    RETURN false;
  END IF;

  RETURN true;
END $function$;

-- promote_from_waitlist: keep_both decide entre sumar la clase o cambiarle
CREATE OR REPLACE FUNCTION public.promote_from_waitlist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_class record; v_ocupadas int; v_cand record; v_tokens text[];
  v_titulo text; v_cuerpo text; v_ok boolean;
  -- Clase de la que se le cambia (si hay). Variables simples y no un record:
  -- un record sin asignar revienta al leerlo ("not assigned yet").
  v_prev_id uuid; v_prev_time time;
BEGIN
  SELECT c.id, c.name, c.class_date, c.class_time, c.max_spots,
         (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid' AS cuando
    INTO v_class FROM public.classes c WHERE c.id = OLD.class_id;
  IF NOT FOUND THEN RETURN OLD; END IF;

  IF v_class.cuando <= now() + interval '2 hours' THEN RETURN OLD; END IF;

  -- Las cuentas demo no ocupan plaza.
  SELECT count(*) INTO v_ocupadas
    FROM public.bookings b JOIN public.profiles p ON p.id = b.user_id
    WHERE b.class_id = OLD.class_id AND NOT p.is_demo;
  IF v_ocupadas >= v_class.max_spots THEN RETURN OLD; END IF;

  FOR v_cand IN
    SELECT w.id, w.user_id, w.keep_both FROM public.class_waitlist w
    WHERE w.class_id = OLD.class_id ORDER BY w.created_at
  LOOP
    -- Si quiere CAMBIARSE (keep_both = false) y tiene otra clase ese día aún
    -- por empezar, se le quita de esa. Si quiere hacer las DOS, no se toca
    -- nada y can_user_book decide si le cabe por el máximo diario.
    v_prev_id := NULL; v_prev_time := NULL;
    IF NOT v_cand.keep_both THEN
      SELECT b.id, c2.class_time INTO v_prev_id, v_prev_time
        FROM public.bookings b JOIN public.classes c2 ON c2.id = b.class_id
        WHERE b.user_id = v_cand.user_id AND c2.class_date = v_class.class_date
          AND b.class_id <> OLD.class_id
          AND (c2.class_date + c2.class_time) AT TIME ZONE 'Europe/Madrid' > now()
        ORDER BY c2.class_time
        LIMIT 1;
    END IF;

    v_ok := false;
    BEGIN
      IF v_prev_id IS NOT NULL THEN
        DELETE FROM public.bookings WHERE id = v_prev_id;
      END IF;
      -- Plan, pago, cupo, máximo diario y ventana. Después de soltar la clase
      -- vieja, para que un cambio no cuente dos veces.
      IF NOT public.can_user_book(v_cand.user_id, OLD.class_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'promocion_no_posible';
      END IF;
      INSERT INTO public.bookings (class_id, user_id) VALUES (OLD.class_id, v_cand.user_id);
      DELETE FROM public.class_waitlist WHERE id = v_cand.id;
      v_ok := true;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      v_ok := false;  -- se deshace todo el sub-bloque; al siguiente de la cola
    END;
    CONTINUE WHEN NOT v_ok;

    -- Para el registro de bajas del admin: quién ocupó la plaza liberada.
    UPDATE public.booking_cancellations SET replaced_by = v_cand.user_id
    WHERE id = (
      SELECT id FROM public.booking_cancellations
      WHERE class_id = OLD.class_id AND user_id = OLD.user_id
      ORDER BY cancelled_at DESC LIMIT 1
    );

    IF v_prev_id IS NOT NULL THEN
      v_titulo := 'Te hemos cambiado de clase';
      v_cuerpo := format('Se ha liberado una plaza en %s del %s a las %s y estabas el primero de la lista: te hemos pasado ahí desde la de las %s, que queda libre. Si no puedes ir, cancélala para dejar sitio.',
                         v_class.name, to_char(v_class.class_date, 'DD/MM'), to_char(v_class.class_time, 'HH24:MI'),
                         to_char(v_prev_time, 'HH24:MI'));
    ELSE
      v_titulo := 'Has entrado en la clase';
      v_cuerpo := format('%s del %s a las %s. Se ha liberado una plaza y estabas el primero. Si no puedes ir, cancélala para dejar sitio.',
                         v_class.name, to_char(v_class.class_date, 'DD/MM'), to_char(v_class.class_time, 'HH24:MI'));
    END IF;

    INSERT INTO public.notifications (user_id, type, title, message, class_id)
    VALUES (v_cand.user_id, 'waitlist_promoted', v_titulo, v_cuerpo, OLD.class_id);

    SELECT array_agg(token) INTO v_tokens FROM public.push_tokens WHERE user_id = v_cand.user_id;
    IF v_tokens IS NOT NULL THEN
      PERFORM net.http_post(
        url     := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := (SELECT jsonb_agg(jsonb_build_object(
                      'to', t, 'sound', 'default', 'title', v_titulo, 'body', v_cuerpo,
                      'data', jsonb_build_object('classId', OLD.class_id::text)))
                    FROM unnest(v_tokens) AS t)
      );
    END IF;

    EXIT;  -- Una plaza liberada, una sola promoción.
  END LOOP;

  RETURN OLD;
END $function$;
