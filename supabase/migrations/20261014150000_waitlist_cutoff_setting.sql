-- Lista de espera: hasta cuándo entra gente de la cola, configurable.
--
-- Antes eran 2 h fijas: a menos de 2 h de la clase nadie subía de la cola.
-- Pero reservar directamente no tiene hora de cierre (can_user_book solo mira
-- que la reserva esté abierta), así que una plaza liberada en esas 2 h se la
-- llevaba quien abriera la app primero y no quien llevaba esperando. Ahora el
-- cierre es un ajuste del admin (app_settings.waitlist_cutoff_minutes, panel
-- "Antelación de reserva") y vale por defecto 30 min.
--
--   0   = entra gente hasta que empieza la clase
--   30  = hasta 30 min antes (por defecto)
--   120 = como antes
--
-- Se aplica igual a subir de la cola (fill_waitlist_vacancy) y a apuntarse a
-- ella (can_join_waitlist): la cola cierra a la vez para los dos.

INSERT INTO public.app_settings (key, value)
VALUES ('waitlist_cutoff_minutes', '30')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.waitlist_cutoff_minutes()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN value ~ '^[0-9]+$' THEN value::int END
       FROM public.app_settings WHERE key = 'waitlist_cutoff_minutes'),
    30);
$$;

REVOKE ALL ON FUNCTION public.waitlist_cutoff_minutes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.waitlist_cutoff_minutes() TO authenticated, service_role;

-- Apuntarse a la cola: hasta el cierre
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
  IF v_when <= now() + make_interval(mins => public.waitlist_cutoff_minutes()) THEN RETURN false; END IF;
  IF public.occupied_spots(p_class_id) < v_max THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE class_id = p_class_id AND user_id = p_user_id) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.class_waitlist WHERE class_id = p_class_id AND user_id = p_user_id) THEN
    RETURN false;
  END IF;
  RETURN true;
END $function$;

-- Subir de la cola: hasta el cierre. Igual que antes salvo la línea del cierre.
CREATE OR REPLACE FUNCTION public.fill_waitlist_vacancy(p_class_id uuid, p_vacancy uuid DEFAULT NULL::uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_class record; v_cand record; v_ok boolean; v_titulo text; v_cuerpo text;
  -- Variables simples y no un record: un record sin asignar revienta al leerlo.
  v_prev_id uuid; v_prev_class uuid; v_prev_time time;
BEGIN
  SELECT c.id, c.name, c.class_date, c.class_time, c.max_spots,
         (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid' AS cuando
    INTO v_class FROM public.classes c WHERE c.id = p_class_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  -- Pasado el cierre de la cola (ajuste del admin) nadie entra de ella
  IF v_class.cuando <= now() + make_interval(mins => public.waitlist_cutoff_minutes()) THEN RETURN; END IF;
  IF public.occupied_spots(p_class_id) >= v_class.max_spots THEN RETURN; END IF;

  FOR v_cand IN
    SELECT w.id, w.user_id, w.keep_both FROM public.class_waitlist w
    WHERE w.class_id = p_class_id ORDER BY w.created_at
  LOOP
    -- keep_both = false (lo normal): si tiene otra clase ese día aún por
    -- empezar, se le cambia desde esa. keep_both solo lo mandan apps antiguas.
    v_prev_id := NULL; v_prev_class := NULL; v_prev_time := NULL;
    IF NOT v_cand.keep_both THEN
      SELECT b.id, b.class_id, c2.class_time INTO v_prev_id, v_prev_class, v_prev_time
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
      IF NOT public.can_user_book(v_cand.user_id, p_class_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'promocion_no_posible';
      END IF;
      INSERT INTO public.bookings (class_id, user_id) VALUES (p_class_id, v_cand.user_id);
      DELETE FROM public.class_waitlist WHERE id = v_cand.id;
      v_ok := true;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      v_ok := false;
    END;
    CONTINUE WHEN NOT v_ok;

    PERFORM public._mark_replaced(p_class_id, v_cand.user_id);

    IF v_prev_id IS NOT NULL THEN
      -- La app le preguntará si lo mantiene o vuelve
      INSERT INTO public.waitlist_moves (user_id, to_class_id, from_class_id)
      VALUES (v_cand.user_id, p_class_id, v_prev_class);
      v_titulo := format('Estás dentro: %s a las %s', v_class.name, to_char(v_class.class_time, 'HH24:MI'));
      v_cuerpo := format('Se liberó plaza el %s y te hemos cambiado desde la de las %s.',
                         to_char(v_class.class_date, 'DD/MM'), to_char(v_prev_time, 'HH24:MI'));
    ELSE
      v_titulo := format('Estás dentro: %s a las %s', v_class.name, to_char(v_class.class_time, 'HH24:MI'));
      v_cuerpo := format('Se liberó plaza el %s. Si no puedes ir, cancélala.',
                         to_char(v_class.class_date, 'DD/MM'));
    END IF;
    PERFORM public._notify_class_push(v_cand.user_id, 'waitlist_promoted', v_titulo, v_cuerpo, p_class_id);
    RETURN;
  END LOOP;
END $function$;
