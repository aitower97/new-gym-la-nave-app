-- Lista de espera: vuelve a entrar directo y se pregunta DESPUÉS.
--
-- La versión con plaza guardada y 20 minutos para decidir
-- (20260929120000_waitlist_offers.sql) se quita: al socio le resultaba
-- forzada. Ahora, como antes, si se libera una plaza el primero de la cola
-- entra directamente; si ya tenía otra clase ese día se le cambia desde ella.
-- Lo nuevo: ese cambio queda apuntado en waitlist_moves y la app le pregunta
-- al abrirla "¿Mantener o volver a las 17:00?". Volver (o quedarse con las
-- dos) solo es posible si su clase anterior sigue teniendo sitio: al soltarla
-- se libera al momento, como siempre.
--
-- Se conservan de la migración anterior: el aforo impuesto en la base
-- (trg_enforce_class_capacity) y can_user_book_excluding.

-- ───────────── Fuera la plaza guardada ─────────────
SELECT cron.unschedule('waitlist-offers-minutely')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'waitlist-offers-minutely');

DROP TRIGGER IF EXISTS trg_cancel_offer_on_waitlist_leave ON public.class_waitlist;
DROP FUNCTION IF EXISTS public.cancel_offer_on_waitlist_leave();
DROP FUNCTION IF EXISTS public.respond_waitlist_offer(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.process_waitlist_offers();
DROP FUNCTION IF EXISTS public.class_held_spots(uuid[]);
DROP FUNCTION IF EXISTS public.offer_expires_at(timestamptz, int);
DROP FUNCTION IF EXISTS public.offer_clock_start(timestamptz);
DROP FUNCTION IF EXISTS public._offer_resume_local(date);
DROP FUNCTION IF EXISTS public._offer_quiet_start();
DROP FUNCTION IF EXISTS public._offer_deadline_text(timestamptz);
DROP FUNCTION IF EXISTS public.waitlist_offer_minutes();

-- Plazas ocupadas = reservas (sin cuentas demo). Ya no hay plazas guardadas.
CREATE OR REPLACE FUNCTION public.occupied_spots(p_class_id uuid, p_except_user uuid DEFAULT NULL)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT count(*)::int FROM public.bookings b JOIN public.profiles p ON p.id = b.user_id
  WHERE b.class_id = p_class_id AND NOT p.is_demo;
$$;
DROP FUNCTION IF EXISTS public.held_spots(uuid, uuid);

DROP TABLE IF EXISTS public.waitlist_offers;
DELETE FROM public.app_settings WHERE key IN ('waitlist_offer_minutes', 'waitlist_quiet_start');

-- ───────────── Cambios desde la lista de espera ─────────────
CREATE TABLE IF NOT EXISTS public.waitlist_moves (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- La clase en la que ha entrado y la que se le soltó
  to_class_id   uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  from_class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'kept', 'back', 'both')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
CREATE INDEX IF NOT EXISTS waitlist_moves_user_pending ON public.waitlist_moves (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS waitlist_moves_to_class ON public.waitlist_moves (to_class_id);
CREATE INDEX IF NOT EXISTS waitlist_moves_from_class ON public.waitlist_moves (from_class_id);

ALTER TABLE public.waitlist_moves ENABLE ROW LEVEL SECURITY;
-- Solo lectura desde la app; se crean en fill_waitlist_vacancy y se
-- contestan con resolve_waitlist_move.
CREATE POLICY waitlist_moves_select_own ON public.waitlist_moves
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY waitlist_moves_select_admin ON public.waitlist_moves
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

-- ───────────── Rellenar una plaza liberada ─────────────
CREATE OR REPLACE FUNCTION public.fill_waitlist_vacancy(p_class_id uuid, p_vacancy uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_class record; v_cand record; v_ok boolean; v_titulo text; v_cuerpo text;
  -- Variables simples y no un record: un record sin asignar revienta al
  -- leerlo ("not assigned yet").
  v_prev_id uuid; v_prev_class uuid; v_prev_time time;
BEGIN
  SELECT c.id, c.name, c.class_date, c.class_time, c.max_spots,
         (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid' AS cuando
    INTO v_class FROM public.classes c WHERE c.id = p_class_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  -- A menos de 2 h nadie entra de la cola: que no le pille una clase sin
  -- darse cuenta.
  IF v_class.cuando <= now() + interval '2 hours' THEN RETURN; END IF;
  IF public.occupied_spots(p_class_id) >= v_class.max_spots THEN RETURN; END IF;

  FOR v_cand IN
    SELECT w.id, w.user_id, w.keep_both FROM public.class_waitlist w
    WHERE w.class_id = p_class_id ORDER BY w.created_at
  LOOP
    -- Si quiere CAMBIARSE (keep_both = false, lo normal) y tiene otra clase
    -- ese día aún por empezar, se le quita de esa. Con keep_both (solo lo
    -- pueden pedir las apps antiguas) se queda con las dos si le caben.
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
    RETURN;  -- una plaza liberada, una sola entrada
  END LOOP;
END $$;

-- ───────────── La respuesta del socio ─────────────
-- p_action: 'keep' (se queda en la nueva), 'back' (vuelve a la anterior y
-- suelta la nueva) o 'both' (recupera la anterior y se queda las dos).
-- 'back' y 'both' solo si la anterior sigue teniendo sitio.
-- Devuelve: 'kept' | 'back' | 'both' | 'full' | 'not_allowed' | 'closed' | 'not_found' | 'bad_action'.
CREATE OR REPLACE FUNCTION public.resolve_waitlist_move(p_move_id uuid, p_action text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_m record; v_new_booking uuid; v_max int;
BEGIN
  SELECT m.id, m.user_id, m.to_class_id, m.from_class_id, m.status,
         (cf.class_date + cf.class_time) AT TIME ZONE 'Europe/Madrid' AS from_when
    INTO v_m
    FROM public.waitlist_moves m JOIN public.classes cf ON cf.id = m.from_class_id
    WHERE m.id = p_move_id
    FOR UPDATE OF m;
  IF NOT FOUND OR v_uid IS NULL OR v_m.user_id <> v_uid THEN RETURN 'not_found'; END IF;
  IF v_m.status <> 'pending' THEN RETURN 'closed'; END IF;

  IF p_action = 'keep' THEN
    UPDATE public.waitlist_moves SET status = 'kept', resolved_at = now() WHERE id = p_move_id;
    RETURN 'kept';
  END IF;
  IF p_action NOT IN ('back', 'both') THEN RETURN 'bad_action'; END IF;

  -- La clase anterior ya empezó: no hay vuelta atrás
  IF v_m.from_when <= now() THEN
    UPDATE public.waitlist_moves SET status = 'kept', resolved_at = now() WHERE id = p_move_id;
    RETURN 'closed';
  END IF;

  SELECT id INTO v_new_booking FROM public.bookings
    WHERE class_id = v_m.to_class_id AND user_id = v_uid;

  -- ¿Sigue habiendo sitio en la anterior? (bloqueo de la clase: nadie más la
  -- coge a la vez)
  SELECT max_spots INTO v_max FROM public.classes WHERE id = v_m.from_class_id FOR UPDATE;
  IF public.occupied_spots(v_m.from_class_id) >= v_max THEN RETURN 'full'; END IF;

  IF p_action = 'back' THEN
    IF NOT public.can_user_book_excluding(v_uid, v_m.from_class_id, v_new_booking) THEN RETURN 'not_allowed'; END IF;
  ELSE
    IF NOT public.can_user_book(v_uid, v_m.from_class_id) THEN RETURN 'not_allowed'; END IF;
  END IF;

  UPDATE public.waitlist_moves SET status = p_action, resolved_at = now() WHERE id = p_move_id;
  IF p_action = 'back' AND v_new_booking IS NOT NULL THEN
    -- Suelta la nueva: entra el siguiente de su lista de espera
    DELETE FROM public.bookings WHERE id = v_new_booking;
  END IF;
  INSERT INTO public.bookings (class_id, user_id) VALUES (v_m.from_class_id, v_uid);
  RETURN p_action;
END $$;

REVOKE EXECUTE ON FUNCTION public.occupied_spots(uuid, uuid), public.fill_waitlist_vacancy(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_waitlist_move(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_waitlist_move(uuid, text) TO authenticated;
