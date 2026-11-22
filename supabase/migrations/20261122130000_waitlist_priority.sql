-- Lista de espera: plantilla, prioridad y orden del admin (noviembre 2026).
--
-- Lo pidió el admin para una socia que quiere un horario lleno sin tener que
-- vigilarlo cada semana:
-- 1. Plantilla con espera: si la clase de la plantilla está llena,
--    smart-action la apunta a la cola (template_join_waitlist) en vez de
--    saltársela. Una vez por clase: si sale de la cola, no se la vuelve a
--    meter (template_waitlist_applied).
-- 2. Prioridad: un horario de plantilla con waitlist_priority entra en la
--    cola por delante de todos los que no la tienen.
-- 3. El admin apunta a mano (admin_waitlist_add) y reordena
--    (admin_waitlist_move).
--
-- El orden de la cola pasa de created_at ("en espera desde", que se queda
-- como dato) a queue_at (el puesto), en las cuatro funciones que la leen.

-- ── Columnas ───────────────────────────────────────────────────────────────
ALTER TABLE public.class_waitlist ADD COLUMN IF NOT EXISTS queue_at timestamptz;
UPDATE public.class_waitlist SET queue_at = created_at WHERE queue_at IS NULL;
ALTER TABLE public.class_waitlist
  ALTER COLUMN queue_at SET DEFAULT clock_timestamp(),
  ALTER COLUMN queue_at SET NOT NULL;
-- Entró por una plantilla con prioridad (se enseña al admin con un icono de estrella)
ALTER TABLE public.class_waitlist ADD COLUMN IF NOT EXISTS priority boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_class_waitlist_queue ON public.class_waitlist (class_id, queue_at, created_at);

ALTER TABLE public.booking_templates ADD COLUMN IF NOT EXISTS waitlist_priority boolean NOT NULL DEFAULT false;

-- Clases en las que la plantilla ya apuntó a alguien a la cola. Si sale de
-- ella, la siguiente pasada del cron no le vuelve a meter. Solo la toca el
-- servidor: RLS activada y sin políticas.
CREATE TABLE IF NOT EXISTS public.template_waitlist_applied (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, class_id)
);
ALTER TABLE public.template_waitlist_applied ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_template_waitlist_applied_class ON public.template_waitlist_applied (class_id);

-- ── Nadie se cuela ─────────────────────────────────────────────────────────
-- El socio inserta su fila directamente (política waitlist_insert_own): sin
-- esto podría mandar un queue_at antiguo o priority = true y ponerse el
-- primero. Solo el admin y el servidor (sin sesión: cron, funciones) fijan
-- el puesto.
CREATE OR REPLACE FUNCTION public._waitlist_guard_queue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.is_admin() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.queue_at := clock_timestamp();
      NEW.priority := false;
      NEW.created_at := clock_timestamp();
    ELSE
      NEW.queue_at := OLD.queue_at;
      NEW.priority := OLD.priority;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_waitlist_guard_queue ON public.class_waitlist;
CREATE TRIGGER trg_waitlist_guard_queue
  BEFORE INSERT OR UPDATE ON public.class_waitlist
  FOR EACH ROW EXECUTE FUNCTION public._waitlist_guard_queue();

-- ── Las cuatro lecturas de la cola, por queue_at ───────────────────────────
CREATE OR REPLACE FUNCTION public.class_waitlist_public(p_class_ids uuid[])
 RETURNS TABLE(class_id uuid, user_id uuid, username text, avatar_url text, posicion integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT w.class_id, w.user_id,
         COALESCE(NULLIF(btrim(p.username), ''), NULLIF(split_part(btrim(p.full_name), ' ', 1), '')),
         p.avatar_url,
         row_number() OVER (PARTITION BY w.class_id ORDER BY w.queue_at, w.created_at)::int
  FROM public.class_waitlist w
  JOIN public.profiles p ON p.id = w.user_id
  WHERE w.class_id = ANY(p_class_ids)
    AND NOT p.is_demo
  ORDER BY w.class_id, w.queue_at, w.created_at;
$function$;

CREATE OR REPLACE FUNCTION public.waitlist_position(p_class_id uuid)
 RETURNS TABLE(posicion integer, total integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*)::int + 1 FROM public.class_waitlist w2
      WHERE w2.class_id = p_class_id
        AND (w2.queue_at, w2.created_at) < (me.queue_at, me.created_at)),
    (SELECT count(*)::int FROM public.class_waitlist w4 WHERE w4.class_id = p_class_id)
  FROM public.class_waitlist me
  WHERE me.class_id = p_class_id AND me.user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.my_waitlist_entries()
RETURNS TABLE (class_id uuid, posicion int, total int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.class_id,
         (SELECT count(*)::int + 1 FROM class_waitlist w2
           WHERE w2.class_id = w.class_id AND (w2.queue_at, w2.created_at) < (w.queue_at, w.created_at)),
         (SELECT count(*)::int FROM class_waitlist w4 WHERE w4.class_id = w.class_id)
  FROM class_waitlist w
  WHERE w.user_id = (SELECT auth.uid());
$$;

-- Quién entra cuando se libera plaza: solo cambia la línea del orden. El
-- resto de la función (cambios de clase, cupo, avisos) queda tal cual; si
-- la línea no está exactamente así, la migración falla en vez de adivinar.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.fill_waitlist_vacancy(uuid, uuid)'::regprocedure);
  v_old constant text := 'WHERE w.class_id = p_class_id ORDER BY w.created_at';
  v_new constant text := 'WHERE w.class_id = p_class_id ORDER BY w.queue_at, w.created_at';
BEGIN
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'fill_waitlist_vacancy no tiene el ORDER BY esperado: revisar a mano';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $$;

-- ── La cola avanza también antes de abrir la ventana de reservas ──────────
-- Antes, la promoción pasaba por can_user_book, que exige estar dentro de la
-- ventana (48 h). Una plaza que se liberaba antes no la cogía nadie de la
-- cola, y al abrirse la ventana se la llevaba quien reservara primero: justo
-- lo que la cola (y la prioridad de plantilla) debe evitar, porque las
-- plantillas llenan las clases con 14 días de antelación.
-- can_user_book_core = las mismas reglas de siempre (plan, pago, cupo,
-- máximo por día) con un interruptor para la ventana. Se genera a partir de
-- la función actual cambiando solo esa línea; si no coincide, falla.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.can_user_book_excluding(uuid, uuid, uuid)'::regprocedure);
  v_sig_old constant text := 'public.can_user_book_excluding(p_user_id uuid, p_class_id uuid, p_exclude_booking uuid)';
  v_sig_new constant text := 'public.can_user_book_core(p_user_id uuid, p_class_id uuid, p_exclude_booking uuid, p_check_window boolean)';
  v_win_old constant text := 'IF now() < v_class_datetime - ';
  v_win_new constant text := 'IF p_check_window AND now() < v_class_datetime - ';
BEGIN
  IF position(v_sig_old IN v_def) = 0 OR position(v_win_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'can_user_book_excluding no es como se esperaba: revisar a mano';
  END IF;
  EXECUTE replace(replace(v_def, v_sig_old, v_sig_new), v_win_old, v_win_new);
END $$;
REVOKE ALL ON FUNCTION public.can_user_book_core(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

-- La de siempre, ahora encima de la nueva: mismas reglas, con ventana
CREATE OR REPLACE FUNCTION public.can_user_book_excluding(p_user_id uuid, p_class_id uuid, p_exclude_booking uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT public.can_user_book_core(p_user_id, p_class_id, p_exclude_booking, true); $function$;

-- Y la promoción, sin ventana
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.fill_waitlist_vacancy(uuid, uuid)'::regprocedure);
  v_old constant text := 'IF NOT public.can_user_book(v_cand.user_id, p_class_id) THEN';
  v_new constant text := 'IF NOT public.can_user_book_core(v_cand.user_id, p_class_id, NULL, false) THEN';
BEGIN
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'fill_waitlist_vacancy no llama a can_user_book como se esperaba: revisar a mano';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $$;

-- ── Plantilla → cola (solo el servidor: smart-action) ──────────────────────
-- Devuelve: ok · applied_before · not_eligible
CREATE OR REPLACE FUNCTION public.template_join_waitlist(p_user_id uuid, p_class_id uuid, p_priority boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_queue timestamptz;
BEGIN
  IF EXISTS (SELECT 1 FROM template_waitlist_applied WHERE user_id = p_user_id AND class_id = p_class_id) THEN
    RETURN 'applied_before';
  END IF;
  -- Mismas reglas que cuando se apunta el socio: llena, a tiempo, sin
  -- reserva ni cola en esa clase y no demo
  IF NOT public.can_join_waitlist(p_user_id, p_class_id) THEN
    RETURN 'not_eligible';
  END IF;

  IF p_priority THEN
    -- Por delante de todos los que no tienen prioridad; entre los que sí,
    -- por orden de llegada
    SELECT least(clock_timestamp(), min(queue_at)) - interval '1 millisecond' INTO v_queue
      FROM class_waitlist WHERE class_id = p_class_id AND NOT priority;
  ELSE
    v_queue := clock_timestamp();
  END IF;

  INSERT INTO class_waitlist (class_id, user_id, keep_both, queue_at, priority)
  VALUES (p_class_id, p_user_id, false, v_queue, p_priority);
  INSERT INTO template_waitlist_applied (user_id, class_id) VALUES (p_user_id, p_class_id);
  RETURN 'ok';
END $$;

REVOKE ALL ON FUNCTION public.template_join_waitlist(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.template_join_waitlist(uuid, uuid, boolean) TO service_role;

-- ── Admin: apuntar a alguien a la cola ─────────────────────────────────────
-- Devuelve: ok · not_allowed · not_found · closed · not_full · demo · booked · already
CREATE OR REPLACE FUNCTION public.admin_waitlist_add(p_class_id uuid, p_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_when timestamptz; v_max int;
BEGIN
  IF NOT public.is_admin() THEN RETURN 'not_allowed'; END IF;
  SELECT (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid', c.max_spots INTO v_when, v_max
    FROM classes c WHERE c.id = p_class_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF v_when <= now() + make_interval(mins => public.waitlist_cutoff_minutes()) THEN RETURN 'closed'; END IF;
  -- Con plaza libre la cola no avanza (solo se mueve al cancelar alguien): se reserva
  IF public.occupied_spots(p_class_id) < v_max THEN RETURN 'not_full'; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND is_demo) THEN RETURN 'demo'; END IF;
  IF EXISTS (SELECT 1 FROM bookings WHERE class_id = p_class_id AND user_id = p_user_id) THEN RETURN 'booked'; END IF;
  IF EXISTS (SELECT 1 FROM class_waitlist WHERE class_id = p_class_id AND user_id = p_user_id) THEN RETURN 'already'; END IF;
  INSERT INTO class_waitlist (class_id, user_id, keep_both) VALUES (p_class_id, p_user_id, false);
  RETURN 'ok';
END $$;

REVOKE ALL ON FUNCTION public.admin_waitlist_add(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_waitlist_add(uuid, uuid) TO authenticated;

-- ── Admin: mover a alguien en la cola ──────────────────────────────────────
-- p_action: up · down · first. Reescribe los puestos de esa clase en el
-- orden nuevo, a partir del más antiguo (quien llegue después sigue detrás).
-- Devuelve: ok · not_allowed · not_found
CREATE OR REPLACE FUNCTION public.admin_waitlist_move(p_id uuid, p_action text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_class uuid; v_ids uuid[]; v_pos int; v_base timestamptz; v_tmp uuid;
BEGIN
  IF NOT public.is_admin() THEN RETURN 'not_allowed'; END IF;
  SELECT class_id INTO v_class FROM class_waitlist WHERE id = p_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  -- La cola de esa clase, bloqueada mientras se reordena
  PERFORM 1 FROM classes WHERE id = v_class FOR UPDATE;
  SELECT array_agg(id ORDER BY queue_at, created_at), min(queue_at)
    INTO v_ids, v_base FROM class_waitlist WHERE class_id = v_class;
  v_pos := array_position(v_ids, p_id);

  IF p_action = 'first' AND v_pos > 1 THEN
    v_ids := ARRAY[p_id] || array_remove(v_ids, p_id);
  ELSIF p_action = 'up' AND v_pos > 1 THEN
    v_tmp := v_ids[v_pos - 1]; v_ids[v_pos - 1] := p_id; v_ids[v_pos] := v_tmp;
  ELSIF p_action = 'down' AND v_pos < array_length(v_ids, 1) THEN
    v_tmp := v_ids[v_pos + 1]; v_ids[v_pos + 1] := p_id; v_ids[v_pos] := v_tmp;
  ELSE
    RETURN 'ok';  -- ya estaba ahí
  END IF;

  UPDATE class_waitlist w
     SET queue_at = v_base + (o.ord - 1) * interval '1 millisecond'
    FROM unnest(v_ids) WITH ORDINALITY AS o(id, ord)
   WHERE w.id = o.id;
  RETURN 'ok';
END $$;

REVOKE ALL ON FUNCTION public.admin_waitlist_move(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_waitlist_move(uuid, text) TO authenticated;
