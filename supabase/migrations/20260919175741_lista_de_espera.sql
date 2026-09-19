-- ============================================================================
-- LISTA DE ESPERA DE CLASES
--
-- Cuando una clase está llena, el socio puede apuntarse a la lista. Si alguien
-- cancela, entra el primero de la cola automáticamente y se le avisa.
--
-- La promoción vive en la base de datos y no en la app a propósito: quien
-- cancela cierra la aplicación al segundo siguiente, así que su móvil no puede
-- ser el responsable de avisar a otro. El push sale directo a la API de Expo
-- con net.http_post (pg_net), sin edge function de por medio — la API de Expo
-- no pide autenticación, así que no hay ningún secreto que custodiar.
--
-- Reglas acordadas:
--   · Entra directo y se le notifica (no hay oferta con caducidad que vigilar).
--   · Solo hasta 2h antes de la clase: más tarde no da tiempo a llegar.
--   · Un socio solo puede estar en una lista de espera a la vez.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.class_waitlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id   uuid NOT NULL REFERENCES public.classes(id)  ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- El orden de la cola es created_at: no se guarda posición, que habría que
  -- recalcular cada vez que alguien se borra.
  UNIQUE (class_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_class_waitlist_class ON public.class_waitlist (class_id, created_at);
CREATE INDEX IF NOT EXISTS idx_class_waitlist_user  ON public.class_waitlist (user_id);

ALTER TABLE public.class_waitlist ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- ¿Puede apuntarse a la lista?
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_join_waitlist(p_user_id uuid, p_class_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_when timestamptz; v_max int; v_ocupadas int;
BEGIN
  SELECT (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid', c.max_spots
    INTO v_when, v_max
    FROM public.classes c WHERE c.id = p_class_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Mismo margen que la promoción: apuntarse a algo que ya no se va a poder
  -- promocionar solo genera falsas esperanzas.
  IF v_when <= now() + interval '2 hours' THEN RETURN false; END IF;

  -- La lista solo tiene sentido si está llena.
  SELECT count(*) INTO v_ocupadas FROM public.bookings WHERE class_id = p_class_id;
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
END $$;

-- ----------------------------------------------------------------------------
-- Políticas
-- ----------------------------------------------------------------------------
-- Cada socio ve solo su propia entrada. Para saber cuántos hay por delante se
-- usa waitlist_position(), que no expone quién está esperando.
DROP POLICY IF EXISTS "waitlist_select_own" ON public.class_waitlist;
CREATE POLICY "waitlist_select_own" ON public.class_waitlist
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "waitlist_admin_all" ON public.class_waitlist;
CREATE POLICY "waitlist_admin_all" ON public.class_waitlist
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "waitlist_insert_own" ON public.class_waitlist;
CREATE POLICY "waitlist_insert_own" ON public.class_waitlist
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id AND public.can_join_waitlist(user_id, class_id));

DROP POLICY IF EXISTS "waitlist_delete_own" ON public.class_waitlist;
CREATE POLICY "waitlist_delete_own" ON public.class_waitlist
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- Posición en la cola, sin revelar la cola
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.waitlist_position(p_class_id uuid)
RETURNS TABLE (posicion int, total int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    (SELECT count(*)::int + 1 FROM public.class_waitlist w2
      WHERE w2.class_id = p_class_id
        AND w2.created_at < (SELECT w3.created_at FROM public.class_waitlist w3
                              WHERE w3.class_id = p_class_id AND w3.user_id = auth.uid())),
    (SELECT count(*)::int FROM public.class_waitlist w4 WHERE w4.class_id = p_class_id)
  WHERE EXISTS (SELECT 1 FROM public.class_waitlist w
                 WHERE w.class_id = p_class_id AND w.user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.waitlist_position(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Promoción al liberarse una plaza
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_from_waitlist() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
END $$;

DROP TRIGGER IF EXISTS trg_promote_from_waitlist ON public.bookings;
CREATE TRIGGER trg_promote_from_waitlist AFTER DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.promote_from_waitlist();

-- Función de trigger: no pinta nada en /rest/v1/rpc/.
REVOKE EXECUTE ON FUNCTION public.promote_from_waitlist() FROM PUBLIC, anon, authenticated;
-- can_join_waitlist sí la llama la política y la app, así que conserva EXECUTE.
GRANT EXECUTE ON FUNCTION public.can_join_waitlist(uuid, uuid) TO authenticated;
