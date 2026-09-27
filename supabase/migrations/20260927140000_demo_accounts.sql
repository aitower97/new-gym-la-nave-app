-- Cuentas demo (revisores de Google Play / App Store).
--
-- Una cuenta con profiles.is_demo = true funciona como un socio normal para
-- ella misma, pero para el resto no existe:
--   * class_roster y class_waitlist_public no la enseñan a nadie más
--     (tampoco a la vista de entrenador, que usa class_roster);
--   * no cuenta para el aforo: la app cuenta plazas con class_roster, y
--     can_join_waitlist / promote_from_waitlist la excluyen al contar;
--   * no puede entrar en listas de espera (no le quita el turno a un socio).
-- Solo un admin puede marcar o desmarcar is_demo.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.prevent_self_demo_flag_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo
     AND auth.uid() IS NOT NULL
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No autorizado para cambiar is_demo';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_prevent_self_demo_flag_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_demo_flag_change();

-- Roster: igual que antes, sin cuentas demo salvo la tuya propia.
-- (Sigue siendo security_invoker = off a propósito; ver 20260919121817.)
CREATE OR REPLACE VIEW public.class_roster WITH (security_invoker = off) AS
 SELECT b.class_id,
    b.user_id,
    p.username,
    p.avatar_url
   FROM ((bookings b
     JOIN profiles p ON ((p.id = b.user_id)))
     JOIN classes c ON ((c.id = b.class_id)))
  WHERE ((c.class_date >= (CURRENT_DATE - 30)) AND (c.class_date <= (CURRENT_DATE + 60)))
    AND (NOT p.is_demo OR b.user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.class_waitlist_public(p_class_ids uuid[])
 RETURNS TABLE(class_id uuid, user_id uuid, username text, avatar_url text, posicion integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT w.class_id, w.user_id, p.username, p.avatar_url,
         row_number() OVER (PARTITION BY w.class_id ORDER BY w.created_at)::int
  FROM public.class_waitlist w
  JOIN public.profiles p ON p.id = w.user_id
  WHERE w.class_id = ANY(p_class_ids)
    AND NOT p.is_demo
  ORDER BY w.class_id, w.created_at;
$function$;

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

  -- Una lista a la vez: si no, podría entrar solo en dos clases del mismo día.
  IF EXISTS (SELECT 1 FROM public.class_waitlist WHERE user_id = p_user_id) THEN
    RETURN false;
  END IF;

  RETURN true;
END $function$;

-- promote_from_waitlist: igual que en 20260927120000, contando plazas sin demo.
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

  -- Las cuentas demo no ocupan plaza.
  SELECT count(*) INTO v_ocupadas
    FROM public.bookings b JOIN public.profiles p ON p.id = b.user_id
    WHERE b.class_id = OLD.class_id AND NOT p.is_demo;
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
