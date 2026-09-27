-- Registro de bajas de clase: quién se borró, cuándo y quién lo hizo.
--
-- Las reservas se BORRAN de bookings al cancelar, así que hasta ahora no
-- quedaba rastro. Un trigger AFTER DELETE deja una fila aquí por cada reserva
-- borrada. Solo la lee el admin; nadie escribe desde la app.
--
-- cancelled_by = auth.uid() de quien borró:
--   = user_id → se borró él mismo
--   otro uuid → lo quitó un admin (a mano o al cambiar su plantilla)
--   NULL      → el sistema (service_role: borrado de cuenta, crons)
-- replaced_by  = quien entró desde la lista de espera a ocupar esa plaza
--                (lo rellena promote_from_waitlist).

CREATE TABLE public.booking_cancellations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id      uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  booked_at     timestamptz,
  cancelled_at  timestamptz NOT NULL DEFAULT now(),
  cancelled_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  replaced_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX booking_cancellations_class_id_idx ON public.booking_cancellations (class_id);

ALTER TABLE public.booking_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_cancellations_admin_select ON public.booking_cancellations
  FOR SELECT USING (public.is_admin());

-- Sin políticas de escritura: solo escriben los triggers (SECURITY DEFINER).
REVOKE INSERT, UPDATE, DELETE ON public.booking_cancellations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_booking_cancellation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.booking_cancellations (class_id, user_id, booked_at, cancelled_by)
  VALUES (OLD.class_id, OLD.user_id, OLD.created_at, auth.uid());
  RETURN OLD;
EXCEPTION
  -- La reserva cae en cascada porque se borra la clase o la cuenta: no es una
  -- baja, y la fila tampoco podría apuntar a algo que ya no existe.
  WHEN foreign_key_violation THEN RETURN OLD;
END $function$;

-- Nombre elegido para ir antes que trg_promote_from_waitlist (los triggers del
-- mismo evento se disparan por orden alfabético): así la baja ya existe
-- cuando la lista de espera anota quién ocupó la plaza.
CREATE TRIGGER trg_log_booking_cancellation
  AFTER DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.log_booking_cancellation();

-- promote_from_waitlist: igual que antes + anotar replaced_by en la baja.
CREATE OR REPLACE FUNCTION public.promote_from_waitlist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_class record; v_ocupadas int; v_cand record; v_tokens text[];
  v_titulo text; v_cuerpo text;
BEGIN
  SELECT c.id, c.name, c.class_date, c.class_time, c.max_spots,
         (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid' AS cuando
    INTO v_class FROM public.classes c WHERE c.id = OLD.class_id;
  IF NOT FOUND THEN RETURN OLD; END IF;

  IF v_class.cuando <= now() + interval '2 hours' THEN RETURN OLD; END IF;

  SELECT count(*) INTO v_ocupadas FROM public.bookings WHERE class_id = OLD.class_id;
  IF v_ocupadas >= v_class.max_spots THEN RETURN OLD; END IF;

  FOR v_cand IN
    SELECT w.id, w.user_id FROM public.class_waitlist w
    WHERE w.class_id = OLD.class_id ORDER BY w.created_at
  LOOP
    -- Tiene que poder reservar de verdad: plan, cupo y ventana de apertura.
    -- Si no, se pasa al siguiente en vez de desperdiciar la plaza.
    CONTINUE WHEN NOT public.can_user_book(v_cand.user_id, OLD.class_id);

    -- Y no tener ya otra clase ese día: la app asume una por día, y meterle
    -- una segunda sin pedirlo sería una sorpresa desagradable.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.bookings b JOIN public.classes c2 ON c2.id = b.class_id
      WHERE b.user_id = v_cand.user_id AND c2.class_date = v_class.class_date
    );

    INSERT INTO public.bookings (class_id, user_id) VALUES (OLD.class_id, v_cand.user_id);
    DELETE FROM public.class_waitlist WHERE id = v_cand.id;

    -- Para el registro de bajas del admin: quién ocupó la plaza liberada.
    UPDATE public.booking_cancellations SET replaced_by = v_cand.user_id
    WHERE id = (
      SELECT id FROM public.booking_cancellations
      WHERE class_id = OLD.class_id AND user_id = OLD.user_id
      ORDER BY cancelled_at DESC LIMIT 1
    );

    v_titulo := 'Has entrado en la clase';
    v_cuerpo := format('%s del %s a las %s. Se ha liberado una plaza y estabas el primero. Si no puedes ir, cancélala para dejar sitio.',
                       v_class.name, to_char(v_class.class_date, 'DD/MM'), to_char(v_class.class_time, 'HH24:MI'));

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
