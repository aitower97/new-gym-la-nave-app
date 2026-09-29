-- Lista de espera con OFERTA: cuando se libera una plaza y el primero de la
-- cola ya tiene otra clase ese día, en vez de cambiarle automáticamente se le
-- OFRECE la plaza (queda guardada para él) y decide en la app:
--   · cambiarse desde su otra clase,
--   · quedarse con las dos (si le caben por el máximo diario), o
--   · seguir como está.
-- Tiene app_settings.waitlist_offer_minutes (20) para contestar. Si no
-- contesta o dice que no, sigue en la lista con su puesto y la plaza se le
-- ofrece al siguiente.
--
-- De noche el reloj se para: de waitlist_quiet_start (23:00) hasta 2 h antes
-- de la primera clase del día siguiente. La oferta llega al momento, pero los
-- minutos empiezan a contar entonces.
--
-- Quien NO tiene otra clase ese día entra directo, como hasta ahora.
--
-- waitlist_offer_minutes = 0 (por defecto) deja todo como estaba: las apps
-- antiguas no tienen la pantalla para contestar, así que el admin lo activa
-- cuando la versión mínima obliga a actualizar.
--
-- Para que la plaza guardada sea de verdad, el aforo pasa a imponerse en la
-- base (antes solo lo miraba la app): trg_enforce_class_capacity.

-- ───────────────────────────── Ajustes ─────────────────────────────
INSERT INTO public.app_settings (key, value) VALUES
  ('waitlist_offer_minutes', '0'),
  ('waitlist_quiet_start', '23:00')
ON CONFLICT (key) DO NOTHING;

-- ───────────────────────────── Tabla ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.waitlist_offers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Una plaza liberada = una vacante; las ofertas que pasan de uno a otro
  -- por la misma plaza comparten vacancy_id (para no volver a ofrecérsela a
  -- quien ya dijo que no a ESA plaza).
  vacancy_id   uuid NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  -- 'move' = se cambió desde otra clase; 'both' = se quedó con las dos
  result       text CHECK (result IN ('move', 'both')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  starts_at    timestamptz NOT NULL,   -- cuándo empieza a contar el reloj
  expires_at   timestamptz NOT NULL,
  reminded_at  timestamptz,
  responded_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_offers_one_pending
  ON public.waitlist_offers (class_id, user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS waitlist_offers_pending_expiry
  ON public.waitlist_offers (expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS waitlist_offers_user ON public.waitlist_offers (user_id);
CREATE INDEX IF NOT EXISTS waitlist_offers_class ON public.waitlist_offers (class_id);

ALTER TABLE public.waitlist_offers ENABLE ROW LEVEL SECURITY;

-- Solo lectura: el socio ve las suyas y el admin todas. Se crean, contestan y
-- caducan únicamente desde las funciones de abajo.
CREATE POLICY waitlist_offers_select_own ON public.waitlist_offers
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY waitlist_offers_select_admin ON public.waitlist_offers
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- ───────────────────────────── Ayudantes ──────────────────────────
CREATE OR REPLACE FUNCTION public.waitlist_offer_minutes()
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((
    SELECT CASE WHEN value ~ '^\d{1,3}$' THEN value::int ELSE 0 END
    FROM public.app_settings WHERE key = 'waitlist_offer_minutes'), 0);
$$;

-- Plazas guardadas (ofertas pendientes) de una clase, sin contar las de
-- p_except_user (quien acepta su propia oferta no compite consigo mismo).
CREATE OR REPLACE FUNCTION public.held_spots(p_class_id uuid, p_except_user uuid DEFAULT NULL)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT count(*)::int FROM public.waitlist_offers
  WHERE class_id = p_class_id AND status = 'pending'
    AND (p_except_user IS NULL OR user_id <> p_except_user);
$$;

-- Plazas ocupadas: reservas (sin cuentas demo) + plazas guardadas.
CREATE OR REPLACE FUNCTION public.occupied_spots(p_class_id uuid, p_except_user uuid DEFAULT NULL)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT (SELECT count(*)::int FROM public.bookings b JOIN public.profiles p ON p.id = b.user_id
          WHERE b.class_id = p_class_id AND NOT p.is_demo)
       + public.held_spots(p_class_id, p_except_user);
$$;

-- Hora local (Madrid) a la que se reanuda el reloj el día d: 2 h antes de su
-- primera clase; si ese día no hay clases, a las 08:00.
CREATE OR REPLACE FUNCTION public._offer_resume_local(d date)
RETURNS timestamp LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(d + (SELECT min(class_time) FROM public.classes WHERE class_date = d) - interval '2 hours',
                  d + time '08:00');
$$;

CREATE OR REPLACE FUNCTION public._offer_quiet_start()
RETURNS time LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((
    SELECT value::time FROM public.app_settings
    WHERE key = 'waitlist_quiet_start' AND value ~ '^\d{1,2}:\d{2}$'), time '23:00');
$$;

-- Cuándo empieza a contar el reloj si la oferta se hace en p_at: al momento,
-- salvo de noche (de quiet_start a 2 h antes de la primera clase).
CREATE OR REPLACE FUNCTION public.offer_clock_start(p_at timestamptz)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_local timestamp := p_at AT TIME ZONE 'Europe/Madrid';
  v_day date := (p_at AT TIME ZONE 'Europe/Madrid')::date;
  v_resume timestamp := public._offer_resume_local(v_day);
BEGIN
  IF v_local < v_resume THEN
    RETURN v_resume AT TIME ZONE 'Europe/Madrid';
  END IF;
  IF v_local::time >= public._offer_quiet_start() THEN
    RETURN public._offer_resume_local(v_day + 1) AT TIME ZONE 'Europe/Madrid';
  END IF;
  RETURN p_at;
END $$;

-- Fin del plazo: p_minutes de reloj "de día". Si el plazo cruza el inicio de
-- la noche, lo que falta se cuenta al reanudarse.
CREATE OR REPLACE FUNCTION public.offer_expires_at(p_at timestamptz, p_minutes int)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_start timestamptz := public.offer_clock_start(p_at);
  v_end timestamptz := v_start + make_interval(mins => p_minutes);
  v_quiet timestamptz := (((v_start AT TIME ZONE 'Europe/Madrid')::date) + public._offer_quiet_start())
                         AT TIME ZONE 'Europe/Madrid';
BEGIN
  IF v_start < v_quiet AND v_end > v_quiet THEN
    RETURN public.offer_clock_start(v_quiet) + (v_end - v_quiet);
  END IF;
  RETURN v_end;
END $$;

-- "a las 17:20" / "mañana a las 08:20" / "el 02/10 a las 08:20", en hora de España
CREATE OR REPLACE FUNCTION public._offer_deadline_text(p_at timestamptz)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE (p_at AT TIME ZONE 'Europe/Madrid')::date - (now() AT TIME ZONE 'Europe/Madrid')::date
           WHEN 0 THEN 'las ' || to_char(p_at AT TIME ZONE 'Europe/Madrid', 'HH24:MI')
           WHEN 1 THEN 'mañana a las ' || to_char(p_at AT TIME ZONE 'Europe/Madrid', 'HH24:MI')
           ELSE 'el ' || to_char(p_at AT TIME ZONE 'Europe/Madrid', 'DD/MM') || ' a las '
                || to_char(p_at AT TIME ZONE 'Europe/Madrid', 'HH24:MI')
         END;
$$;

-- Aviso en la app + push, con datos para que la app sepa de qué va.
CREATE OR REPLACE FUNCTION public._notify_class_push(
  p_user_id uuid, p_type text, p_title text, p_message text, p_class_id uuid, p_push boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tokens text[];
BEGIN
  INSERT INTO public.notifications (user_id, type, title, message, class_id)
  VALUES (p_user_id, p_type, p_title, p_message, p_class_id);

  IF NOT p_push THEN RETURN; END IF;
  SELECT array_agg(token) INTO v_tokens FROM public.push_tokens WHERE user_id = p_user_id;
  IF v_tokens IS NOT NULL THEN
    PERFORM net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := (SELECT jsonb_agg(jsonb_build_object(
                    'to', t, 'sound', 'default', 'title', p_title, 'body', p_message,
                    'data', jsonb_build_object('classId', p_class_id::text, 'type', p_type)))
                  FROM unnest(v_tokens) AS t)
    );
  END IF;
END $$;

-- Registro de bajas del admin: quién ocupó la plaza liberada.
CREATE OR REPLACE FUNCTION public._mark_replaced(p_class_id uuid, p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.booking_cancellations SET replaced_by = p_user_id
  WHERE id = (
    SELECT id FROM public.booking_cancellations
    WHERE class_id = p_class_id AND replaced_by IS NULL AND user_id <> p_user_id
    ORDER BY cancelled_at DESC LIMIT 1
  );
$$;

-- ─────────────── can_user_book con "sin contar esta reserva" ───────────────
-- Igual que can_user_book, pero puede ignorar una reserva del socio
-- (p_exclude_booking): la de la clase que soltaría al cambiarse. Así se sabe
-- si un cambio es posible sin tener que borrar nada para probarlo.
CREATE OR REPLACE FUNCTION public.can_user_book_excluding(p_user_id uuid, p_class_id uuid, p_exclude_booking uuid)
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
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_grace int;
BEGIN
  -- plan_assigned_at::date en UTC a propósito: es la clave de la ventana del
  -- bono y de plan_adjustments en quota_period_start y en la app
  -- (src/utils/bonoWindow.ts). Cambiarlo aquí descuadraría los ajustes.
  SELECT plan_id, (created_at AT TIME ZONE 'Europe/Madrid')::date,
         plan_assigned_at::date, free_trial_used_at
    INTO v_plan_id, v_created_at_date, v_plan_assigned_at, v_trial_used
    FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid', c.class_date
    INTO v_class_datetime, v_class_date
    FROM public.classes c WHERE c.id = p_class_id;
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
      v_period_end := v_plan_assigned_at + v_validity_days;
      -- La clase tiene que caer dentro de la vigencia del bono
      IF v_class_date < v_period_start OR v_class_date >= v_period_end THEN RETURN false; END IF;
      IF v_classes_per_month IS NOT NULL THEN
        SELECT count(*) INTO v_count FROM public.bookings b JOIN public.classes c ON c.id = b.class_id
          WHERE b.user_id = p_user_id AND b.class_id <> p_class_id
            AND b.id IS DISTINCT FROM p_exclude_booking
            AND c.class_date >= v_period_start AND c.class_date < v_period_end;
        SELECT COALESCE(sum(used_delta), 0) INTO v_adjust FROM public.plan_adjustments
          WHERE user_id = p_user_id AND period_start = v_period_start;
        IF (v_count + v_adjust) >= v_classes_per_month THEN RETURN false; END IF;
      END IF;
    ELSE
      -- Periodo de la CLASE (no de hoy)
      v_period_months := CASE v_billing_period WHEN 'yearly' THEN 12 WHEN 'quarterly' THEN 3 ELSE 1 END;
      v_period_start := date_trunc(CASE v_billing_period WHEN 'yearly' THEN 'year' WHEN 'quarterly' THEN 'quarter' ELSE 'month' END, v_class_date)::date;
      v_period_end := (v_period_start + (v_period_months || ' months')::interval)::date;

      IF v_billing_period <> 'daily' THEN
        SELECT COALESCE(offset_days, 5) INTO v_grace FROM public.notification_templates WHERE key = 'payment_blocked';
        v_grace := COALESCE(v_grace, 5);

        SELECT EXISTS(SELECT 1 FROM public.plan_payments WHERE user_id = p_user_id AND period_start = v_period_start) INTO v_paid;
        IF NOT v_paid THEN
          -- Sin pagar el periodo de la clase: vale mientras dure la gracia
          -- (bloqueo desde el día v_grace del periodo)
          IF v_today >= v_period_start + (v_grace - 1) THEN RETURN false; END IF;
          -- ...y siempre que no arrastre el periodo anterior sin pagar
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
          WHERE b.user_id = p_user_id AND b.class_id <> p_class_id
            AND b.id IS DISTINCT FROM p_exclude_booking
            AND c.class_date >= v_period_start AND c.class_date < v_period_end;
        SELECT COALESCE(sum(used_delta), 0) INTO v_adjust FROM public.plan_adjustments
          WHERE user_id = p_user_id AND period_start = v_period_start;
        IF (v_count + v_adjust) >= (v_classes_per_month * v_period_months) THEN RETURN false; END IF;
      END IF;
    END IF;
  END IF;

  -- Máximo de clases por día (sin contar esta misma clase)
  SELECT count(*) INTO v_same_day FROM public.bookings b JOIN public.classes c ON c.id = b.class_id
    WHERE b.user_id = p_user_id AND b.class_id <> p_class_id
      AND b.id IS DISTINCT FROM p_exclude_booking
      AND c.class_date = v_class_date;
  IF v_same_day >= public.max_classes_per_day() THEN RETURN false; END IF;

  -- Ventana de antelación
  SELECT COALESCE(value::int, 48) INTO v_cutoff_hours FROM public.app_settings WHERE key = 'booking_cutoff_hours';
  IF now() < v_class_datetime - (COALESCE(v_cutoff_hours, 48) || ' hours')::interval THEN RETURN false; END IF;

  RETURN true;
END;
$function$;

-- La de siempre: misma lógica, sin excluir nada (la usan la RLS de bookings y la app).
CREATE OR REPLACE FUNCTION public.can_user_book(p_user_id uuid, p_class_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$ SELECT public.can_user_book_excluding(p_user_id, p_class_id, NULL); $$;

-- ───────────────────────── Aforo en la base ─────────────────────────
-- Antes el aforo solo lo miraba la app. Con plazas guardadas hace falta que
-- lo imponga la base: si no, una app antigua (que no sabe de ofertas) vería
-- la plaza libre y la cogería. Admin y procesos internos (sin sesión: crons,
-- edge functions) no pasan por aquí: el admin puede sobrecargar a propósito
-- y smart-action cuenta el aforo por su cuenta.
CREATE OR REPLACE FUNCTION public.enforce_class_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_max int;
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN RETURN NEW; END IF;
  -- Bloqueo de la fila de la clase: dos reservas a la vez de la última plaza
  -- se ponen en fila en vez de entrar las dos.
  SELECT max_spots INTO v_max FROM public.classes WHERE id = NEW.class_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF public.occupied_spots(NEW.class_id, NEW.user_id) >= v_max THEN
    RAISE EXCEPTION 'La clase está completa' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_class_capacity ON public.bookings;
CREATE TRIGGER trg_enforce_class_capacity
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_class_capacity();

-- ───────────────────── Rellenar una plaza liberada ─────────────────────
-- Recorre la cola en orden. A quien tiene otra clase ese día (y las ofertas
-- están activadas) se le OFRECE y se para; a quien no, entra directo como
-- siempre. p_vacancy agrupa las ofertas de la misma plaza.
CREATE OR REPLACE FUNCTION public.fill_waitlist_vacancy(p_class_id uuid, p_vacancy uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_class record; v_cand record; v_minutes int := public.waitlist_offer_minutes();
  v_ok boolean; v_titulo text; v_cuerpo text;
  -- Variables simples y no un record: un record sin asignar revienta al
  -- leerlo ("not assigned yet").
  v_prev_id uuid; v_prev_time time; v_prev_times text; v_conflict boolean;
  v_start timestamptz; v_exp timestamptz;
BEGIN
  SELECT c.id, c.name, c.class_date, c.class_time, c.max_spots,
         (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid' AS cuando
    INTO v_class FROM public.classes c WHERE c.id = p_class_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  -- A menos de 2 h nadie entra de la cola (ni se ofrece): que no le pille
  -- una clase sin darse cuenta.
  IF v_class.cuando <= now() + interval '2 hours' THEN RETURN; END IF;
  IF public.occupied_spots(p_class_id) >= v_class.max_spots THEN RETURN; END IF;

  FOR v_cand IN
    SELECT w.id, w.user_id, w.keep_both FROM public.class_waitlist w
    WHERE w.class_id = p_class_id
      -- ni quien ya tiene una oferta abierta de esta clase, ni quien ya dijo
      -- que no (o dejó pasar el tiempo) a ESTA plaza
      AND NOT EXISTS (
        SELECT 1 FROM public.waitlist_offers o
        WHERE o.class_id = p_class_id AND o.user_id = w.user_id
          AND (o.status = 'pending' OR o.vacancy_id = p_vacancy))
    ORDER BY w.created_at
  LOOP
    -- Otras clases suyas ese día que aún no han empezado
    SELECT string_agg(to_char(c2.class_time, 'HH24:MI'), ' y ' ORDER BY c2.class_time), count(*) > 0
      INTO v_prev_times, v_conflict
      FROM public.bookings b JOIN public.classes c2 ON c2.id = b.class_id
      WHERE b.user_id = v_cand.user_id AND c2.class_date = v_class.class_date
        AND b.class_id <> p_class_id
        AND (c2.class_date + c2.class_time) AT TIME ZONE 'Europe/Madrid' > now();

    IF v_minutes > 0 AND v_conflict THEN
      -- Solo si de alguna forma podría entrar: quedándose con las dos, o
      -- cambiándose desde su primera clase de ese día.
      SELECT b.id INTO v_prev_id
        FROM public.bookings b JOIN public.classes c2 ON c2.id = b.class_id
        WHERE b.user_id = v_cand.user_id AND c2.class_date = v_class.class_date
          AND b.class_id <> p_class_id
          AND (c2.class_date + c2.class_time) AT TIME ZONE 'Europe/Madrid' > now()
        ORDER BY c2.class_time LIMIT 1;
      CONTINUE WHEN NOT (public.can_user_book(v_cand.user_id, p_class_id)
                         OR public.can_user_book_excluding(v_cand.user_id, p_class_id, v_prev_id));

      v_start := public.offer_clock_start(now());
      v_exp := public.offer_expires_at(now(), v_minutes);
      INSERT INTO public.waitlist_offers (class_id, user_id, vacancy_id, starts_at, expires_at)
      VALUES (p_class_id, v_cand.user_id, p_vacancy, v_start, v_exp);

      PERFORM public._notify_class_push(
        v_cand.user_id, 'waitlist_offer', 'Se ha liberado una plaza',
        format('%s del %s a las %s. Eres el primero de la lista y ese día ya tienes la de las %s. Entra en la app antes de %s y elige si te cambias, te quedas con las dos o sigues como estás. Si no contestas, pasará al siguiente.',
               v_class.name, to_char(v_class.class_date, 'DD/MM'), to_char(v_class.class_time, 'HH24:MI'),
               v_prev_times, public._offer_deadline_text(v_exp)),
        p_class_id);
      RETURN;  -- una plaza, una oferta
    END IF;

    -- Entrada directa (como hasta ahora). Con las ofertas desactivadas se
    -- respeta keep_both: false = cambiarle desde su otra clase de ese día.
    v_prev_id := NULL; v_prev_time := NULL;
    IF v_minutes = 0 AND NOT v_cand.keep_both THEN
      SELECT b.id, c2.class_time INTO v_prev_id, v_prev_time
        FROM public.bookings b JOIN public.classes c2 ON c2.id = b.class_id
        WHERE b.user_id = v_cand.user_id AND c2.class_date = v_class.class_date
          AND b.class_id <> p_class_id
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
      IF NOT public.can_user_book(v_cand.user_id, p_class_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'promocion_no_posible';
      END IF;
      INSERT INTO public.bookings (class_id, user_id) VALUES (p_class_id, v_cand.user_id);
      DELETE FROM public.class_waitlist WHERE id = v_cand.id;
      v_ok := true;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      v_ok := false;  -- se deshace todo el sub-bloque; al siguiente de la cola
    END;
    CONTINUE WHEN NOT v_ok;

    PERFORM public._mark_replaced(p_class_id, v_cand.user_id);

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
    PERFORM public._notify_class_push(v_cand.user_id, 'waitlist_promoted', v_titulo, v_cuerpo, p_class_id);
    RETURN;  -- una plaza liberada, una sola entrada
  END LOOP;
END $$;

-- El trigger de siempre (al borrar una reserva) ahora solo abre la vacante.
CREATE OR REPLACE FUNCTION public.promote_from_waitlist()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.fill_waitlist_vacancy(OLD.class_id, gen_random_uuid());
  RETURN OLD;
END $$;

-- ───────────────────── Contestar a una oferta ─────────────────────
-- p_action: 'move' (cambiarse; p_booking_id elige desde qué clase si tiene
-- varias ese día), 'both' (quedarse con las dos) o 'decline' (seguir como
-- está: conserva su puesto en la lista y la plaza pasa al siguiente).
-- Devuelve: 'move' | 'both' | 'declined' | 'expired' | 'closed' |
-- 'not_allowed' | 'not_found' | 'bad_action'.
CREATE OR REPLACE FUNCTION public.respond_waitlist_offer(p_offer_id uuid, p_action text, p_booking_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_o record; v_drop uuid;
BEGIN
  SELECT o.id, o.user_id, o.class_id, o.vacancy_id, o.status, o.expires_at, c.class_date,
         (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid' AS cuando
    INTO v_o
    FROM public.waitlist_offers o JOIN public.classes c ON c.id = o.class_id
    WHERE o.id = p_offer_id
    FOR UPDATE OF o;
  IF NOT FOUND OR v_uid IS NULL OR v_o.user_id <> v_uid THEN RETURN 'not_found'; END IF;
  IF v_o.status <> 'pending' THEN RETURN 'closed'; END IF;
  IF v_o.expires_at <= now() OR v_o.cuando <= now() THEN RETURN 'expired'; END IF;

  IF p_action = 'decline' THEN
    UPDATE public.waitlist_offers SET status = 'declined', responded_at = now() WHERE id = p_offer_id;
    PERFORM public.fill_waitlist_vacancy(v_o.class_id, v_o.vacancy_id);
    RETURN 'declined';
  ELSIF p_action = 'move' THEN
    SELECT b.id INTO v_drop
      FROM public.bookings b JOIN public.classes c2 ON c2.id = b.class_id
      WHERE b.user_id = v_uid AND c2.class_date = v_o.class_date AND b.class_id <> v_o.class_id
        AND (c2.class_date + c2.class_time) AT TIME ZONE 'Europe/Madrid' > now()
        AND (p_booking_id IS NULL OR b.id = p_booking_id)
      ORDER BY c2.class_time LIMIT 1;
    -- Si ya no tiene otra clase ese día, "cambiarse" es simplemente entrar
    IF NOT public.can_user_book_excluding(v_uid, v_o.class_id, v_drop) THEN RETURN 'not_allowed'; END IF;
  ELSIF p_action = 'both' THEN
    IF NOT public.can_user_book(v_uid, v_o.class_id) THEN RETURN 'not_allowed'; END IF;
  ELSE
    RETURN 'bad_action';
  END IF;

  -- Aceptada antes de reservar: así su plaza guardada deja de contar como
  -- ocupada y el control de aforo le deja entrar.
  UPDATE public.waitlist_offers
    SET status = 'accepted', result = p_action, responded_at = now()
    WHERE id = p_offer_id;
  IF v_drop IS NOT NULL THEN
    -- Suelta su otra clase: eso abre a su vez una vacante allí.
    DELETE FROM public.bookings WHERE id = v_drop;
  END IF;
  INSERT INTO public.bookings (class_id, user_id) VALUES (v_o.class_id, v_uid);
  PERFORM public._mark_replaced(v_o.class_id, v_uid);
  RETURN p_action;
END $$;

-- ─────────────── Caducar ofertas y recordar (cron, cada minuto) ───────────────
CREATE OR REPLACE FUNCTION public.process_waitlist_offers()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_o record;
BEGIN
  -- Caducadas: sigue en la lista, se avisa, y la plaza pasa al siguiente.
  FOR v_o IN
    SELECT o.id, o.user_id, o.class_id, o.vacancy_id, c.name, c.class_date, c.class_time
    FROM public.waitlist_offers o JOIN public.classes c ON c.id = o.class_id
    WHERE o.status = 'pending' AND o.expires_at <= now()
    ORDER BY o.expires_at
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    UPDATE public.waitlist_offers SET status = 'expired', responded_at = now() WHERE id = v_o.id;
    PERFORM public._notify_class_push(
      v_o.user_id, 'waitlist_offer_expired', 'Se acabó el tiempo',
      format('No contestaste a tiempo a la plaza de %s del %s a las %s y ha pasado al siguiente. Sigues en la lista de espera.',
             v_o.name, to_char(v_o.class_date, 'DD/MM'), to_char(v_o.class_time, 'HH24:MI')),
      v_o.class_id, false);
    PERFORM public.fill_waitlist_vacancy(v_o.class_id, v_o.vacancy_id);
  END LOOP;

  -- Recordatorio cuando quedan 5 minutos (solo push; el aviso en la app ya está)
  FOR v_o IN
    SELECT o.id, o.user_id, o.class_id, c.name, c.class_time
    FROM public.waitlist_offers o JOIN public.classes c ON c.id = o.class_id
    WHERE o.status = 'pending' AND o.reminded_at IS NULL
      AND o.starts_at <= now() AND o.expires_at - now() <= interval '5 minutes'
      AND o.expires_at > now()
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    UPDATE public.waitlist_offers SET reminded_at = now() WHERE id = v_o.id;
    PERFORM net.http_post(
      url     := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := (SELECT jsonb_agg(jsonb_build_object(
                    'to', t.token, 'sound', 'default',
                    'title', 'Te quedan 5 minutos',
                    'body', format('Para decidir si te quedas la plaza de %s a las %s.', v_o.name, to_char(v_o.class_time, 'HH24:MI')),
                    'data', jsonb_build_object('classId', v_o.class_id::text, 'type', 'waitlist_offer')))
                  FROM public.push_tokens t WHERE t.user_id = v_o.user_id)
    )
    WHERE EXISTS (SELECT 1 FROM public.push_tokens WHERE user_id = v_o.user_id);
  END LOOP;
END $$;

-- ─────────── Si sale de la lista con una oferta abierta, al siguiente ───────────
CREATE OR REPLACE FUNCTION public.cancel_offer_on_waitlist_leave()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_vacancy uuid;
BEGIN
  UPDATE public.waitlist_offers SET status = 'cancelled', responded_at = now()
    WHERE class_id = OLD.class_id AND user_id = OLD.user_id AND status = 'pending'
    RETURNING vacancy_id INTO v_vacancy;
  IF v_vacancy IS NOT NULL THEN
    PERFORM public.fill_waitlist_vacancy(OLD.class_id, v_vacancy);
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_cancel_offer_on_waitlist_leave ON public.class_waitlist;
CREATE TRIGGER trg_cancel_offer_on_waitlist_leave
  AFTER DELETE ON public.class_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.cancel_offer_on_waitlist_leave();

-- ─────────── Lista de espera: "llena" cuenta también las plazas guardadas ───────────
CREATE OR REPLACE FUNCTION public.can_join_waitlist(p_user_id uuid, p_class_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_when timestamptz; v_max int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND is_demo) THEN
    RETURN false;
  END IF;

  SELECT (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid', c.max_spots
    INTO v_when, v_max
    FROM public.classes c WHERE c.id = p_class_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_when <= now() + interval '2 hours' THEN RETURN false; END IF;

  -- Reservas (sin demo) + plazas guardadas para la lista
  IF public.occupied_spots(p_class_id) < v_max THEN RETURN false; END IF;

  IF EXISTS (SELECT 1 FROM public.bookings WHERE class_id = p_class_id AND user_id = p_user_id) THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.class_waitlist WHERE class_id = p_class_id AND user_id = p_user_id) THEN
    RETURN false;
  END IF;

  RETURN true;
END $function$;

-- ─────────── Para la app: plazas guardadas por clase ───────────
CREATE OR REPLACE FUNCTION public.class_held_spots(p_class_ids uuid[])
RETURNS TABLE(class_id uuid, held int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT o.class_id, count(*)::int FROM public.waitlist_offers o
  WHERE o.class_id = ANY(p_class_ids) AND o.status = 'pending'
  GROUP BY o.class_id;
$$;

-- ─────────── Permisos ───────────
-- Todo es interno salvo contestar a la oferta, las plazas guardadas (lista de
-- clases) y las dos de siempre que ya llamaba la app.
REVOKE EXECUTE ON FUNCTION
  public.waitlist_offer_minutes(),
  public.held_spots(uuid, uuid),
  public.occupied_spots(uuid, uuid),
  public._offer_resume_local(date),
  public._offer_quiet_start(),
  public.offer_clock_start(timestamptz),
  public.offer_expires_at(timestamptz, int),
  public._offer_deadline_text(timestamptz),
  public._notify_class_push(uuid, text, text, text, uuid, boolean),
  public._mark_replaced(uuid, uuid),
  public.can_user_book_excluding(uuid, uuid, uuid),
  public.enforce_class_capacity(),
  public.fill_waitlist_vacancy(uuid, uuid),
  public.process_waitlist_offers(),
  public.cancel_offer_on_waitlist_leave(),
  public.respond_waitlist_offer(uuid, text, uuid),
  public.class_held_spots(uuid[])
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.respond_waitlist_offer(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.class_held_spots(uuid[]) TO authenticated;

-- ─────────── Cron: caducar y recordar, cada minuto ───────────
SELECT cron.unschedule('waitlist-offers-minutely')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'waitlist-offers-minutely');
SELECT cron.schedule('waitlist-offers-minutely', '* * * * *', $$ SELECT public.process_waitlist_offers(); $$);
