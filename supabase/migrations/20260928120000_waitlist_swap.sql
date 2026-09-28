-- Lista de espera: quien ya tiene otra clase ese día, se CAMBIA.
--
-- Caso real (CROSS TRAINING 28/09 10:00): Cristina tenía la clase de las
-- 11:00 y se apuntó a la cola de las 10:00 para cambiarse. La regla "no
-- meter a quien ya tiene otra clase ese día" se la saltó dos veces y la
-- plaza fue a los siguientes. Apuntarse a una cola teniendo otra clase ese
-- día solo puede significar querer cambiarse, así que ahora se le cambia:
-- se borra su otra reserva (futura) del día y entra en esta. Su plaza vieja
-- queda libre para la cola de esa otra clase (el DELETE dispara esta misma
-- función para ella) y en el registro del admin sale como cambio de clase
-- (link_class_change).
--
-- Si ese día ya tuvo una clase que ha empezado o terminado, se le sigue
-- saltando: no se le da una segunda clase el mismo día sin pedirlo.
--
-- El cambio va en un sub-bloque con EXCEPTION (subtransacción): si al final
-- no puede reservar (plan, pago, cupo), se deshace el borrado de su clase
-- vieja y se pasa al siguiente de la cola.

CREATE OR REPLACE FUNCTION public.promote_from_waitlist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_class record; v_ocupadas int; v_cand record; v_prev record; v_tokens text[];
  v_titulo text; v_cuerpo text; v_ok boolean;
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
    SELECT w.id, w.user_id FROM public.class_waitlist w
    WHERE w.class_id = OLD.class_id ORDER BY w.created_at
  LOOP
    -- Ya fue (o está) en otra clase de ese día: no se le da una segunda.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.bookings b JOIN public.classes c2 ON c2.id = b.class_id
      WHERE b.user_id = v_cand.user_id AND c2.class_date = v_class.class_date
        AND b.class_id <> OLD.class_id
        AND (c2.class_date + c2.class_time) AT TIME ZONE 'Europe/Madrid' <= now()
    );

    -- ¿Tiene otra clase ese día aún por empezar? Entonces es un cambio.
    v_prev := NULL;
    SELECT b.id, b.class_id, c2.name, c2.class_time INTO v_prev
      FROM public.bookings b JOIN public.classes c2 ON c2.id = b.class_id
      WHERE b.user_id = v_cand.user_id AND c2.class_date = v_class.class_date
        AND b.class_id <> OLD.class_id
      LIMIT 1;

    v_ok := false;
    BEGIN
      IF v_prev.id IS NOT NULL THEN
        DELETE FROM public.bookings WHERE id = v_prev.id;
      END IF;
      -- Tiene que poder reservar de verdad: plan, pago, cupo y ventana. Se
      -- comprueba después de soltar su clase vieja, para que un cambio no
      -- cuente dos veces en el cupo.
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

    IF v_prev.id IS NOT NULL THEN
      v_titulo := 'Te hemos cambiado de clase';
      v_cuerpo := format('Se ha liberado una plaza en %s del %s a las %s y estabas el primero de la lista: te hemos pasado ahí desde la de las %s, que queda libre. Si no puedes ir, cancélala para dejar sitio.',
                         v_class.name, to_char(v_class.class_date, 'DD/MM'), to_char(v_class.class_time, 'HH24:MI'),
                         to_char(v_prev.class_time, 'HH24:MI'));
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

-- Reservar una clase saca de su cola: antes quien reservaba a mano una plaza
-- libre seguía apareciendo "en espera" de esa misma clase.
CREATE OR REPLACE FUNCTION public.remove_waitlist_on_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.class_waitlist WHERE class_id = NEW.class_id AND user_id = NEW.user_id;
  RETURN NEW;
END $function$;

CREATE TRIGGER trg_remove_waitlist_on_booking
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.remove_waitlist_on_booking();

-- Colas que ya estaban así (p. ej. Cristina, 28/09 10:00)
DELETE FROM public.class_waitlist w
USING public.bookings b
WHERE b.class_id = w.class_id AND b.user_id = w.user_id;
