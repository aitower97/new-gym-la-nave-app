-- Orden fijo de la lista de espera por horario (noviembre 2026).
--
-- El admin ordena una lista de socios para un horario recurrente (día de la
-- semana + hora + tipo, como la plantilla) y vale para todas las semanas.
-- La lista no apunta a nadie: solo decide el puesto de quien ya está en la
-- cola (por su plantilla o a mano). Orden de la cola de una clase con lista:
--   1. los de la lista, en su orden;
--   2. el resto, como estaban (la estrella ya los puso delante al entrar).
-- Se aplica cada vez que alguien entra en la cola y al guardar la lista. Un
-- cambio a mano del admin (↑ ↓) dura hasta que entra alguien nuevo.

-- ── Tabla ─────────────────────────────────────────────────────────────────
-- day_of_week como en booking_templates: 0 = domingo (getDay / extract(dow)).
CREATE TABLE IF NOT EXISTS public.waitlist_slot_order (
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  class_time time NOT NULL,
  class_type text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  position int NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day_of_week, class_time, class_type, user_id)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_slot_order_user ON public.waitlist_slot_order (user_id);
ALTER TABLE public.waitlist_slot_order ENABLE ROW LEVEL SECURITY;
-- Solo el admin la lee; se escribe solo por admin_set_slot_order
DROP POLICY IF EXISTS waitlist_slot_order_select ON public.waitlist_slot_order;
CREATE POLICY waitlist_slot_order_select ON public.waitlist_slot_order FOR SELECT TO authenticated
  USING ((SELECT is_admin()));

-- ── Aplicar el orden a la cola de una clase ───────────────────────────────
CREATE OR REPLACE FUNCTION public._waitlist_apply_slot_order(p_class_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dow int; v_time time; v_type text; v_ids uuid[]; v_base timestamptz;
BEGIN
  -- La cola de esa clase, bloqueada mientras se reordena (como admin_waitlist_move)
  SELECT extract(dow FROM class_date)::int, class_time, class_type
    INTO v_dow, v_time, v_type
    FROM classes WHERE id = p_class_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM waitlist_slot_order
                  WHERE day_of_week = v_dow AND class_time = v_time AND class_type = v_type) THEN
    RETURN;
  END IF;

  SELECT array_agg(w.id ORDER BY (o.position IS NULL), o.position, w.queue_at, w.created_at),
         min(w.queue_at)
    INTO v_ids, v_base
    FROM class_waitlist w
    LEFT JOIN waitlist_slot_order o
      ON o.user_id = w.user_id AND o.day_of_week = v_dow AND o.class_time = v_time AND o.class_type = v_type
   WHERE w.class_id = p_class_id;
  IF v_ids IS NULL THEN RETURN; END IF;

  -- El guardián de la cola deja pasar este cambio (ver _waitlist_guard_queue)
  PERFORM set_config('app.waitlist_reorder', 'on', true);
  UPDATE class_waitlist w
     SET queue_at = v_base + (o.ord - 1) * interval '1 millisecond'
    FROM unnest(v_ids) WITH ORDINALITY AS o(id, ord)
   WHERE w.id = o.id
     AND w.queue_at IS DISTINCT FROM v_base + (o.ord - 1) * interval '1 millisecond';
  PERFORM set_config('app.waitlist_reorder', 'off', true);
END $$;
REVOKE ALL ON FUNCTION public._waitlist_apply_slot_order(uuid) FROM PUBLIC, anon, authenticated;

-- Al entrar alguien en la cola (socio, admin o plantilla)
CREATE OR REPLACE FUNCTION public._waitlist_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._waitlist_apply_slot_order(NEW.class_id);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._waitlist_after_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_waitlist_apply_slot_order ON public.class_waitlist;
CREATE TRIGGER trg_waitlist_apply_slot_order
  AFTER INSERT ON public.class_waitlist
  FOR EACH ROW EXECUTE FUNCTION public._waitlist_after_insert();

-- ── El guardián deja pasar el reordenado ──────────────────────────────────
-- Un socio que se apunta dispara el reordenado con su propia sesión; sin
-- esta excepción, el guardián le devolvería a todos su puesto anterior.
-- El ajuste solo se puede poner desde dentro de la base (los clientes no
-- tienen forma de llamar a set_config).
CREATE OR REPLACE FUNCTION public._waitlist_guard_queue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.is_admin()
     AND coalesce(current_setting('app.waitlist_reorder', true), '') <> 'on' THEN
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
-- Función de trigger: nadie tiene que llamarla por la API (aviso del linter)
REVOKE ALL ON FUNCTION public._waitlist_guard_queue() FROM PUBLIC, anon, authenticated;

-- ── Admin: guardar la lista de un horario ─────────────────────────────────
-- p_user_ids en orden. Lista vacía = sin orden fijo. Reordena ya las colas
-- de las clases futuras de ese horario.
-- Devuelve: ok · not_allowed · bad_slot
CREATE OR REPLACE FUNCTION public.admin_set_slot_order(
  p_day_of_week int, p_class_time time, p_class_type text, p_user_ids uuid[])
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_class uuid;
BEGIN
  IF NOT public.is_admin() THEN RETURN 'not_allowed'; END IF;
  IF p_day_of_week NOT BETWEEN 0 AND 6 OR p_class_time IS NULL OR coalesce(p_class_type, '') = '' THEN
    RETURN 'bad_slot';
  END IF;

  DELETE FROM waitlist_slot_order
   WHERE day_of_week = p_day_of_week AND class_time = p_class_time AND class_type = p_class_type;

  -- Sin repetidos (se queda el primer puesto) ni cuentas demo
  INSERT INTO waitlist_slot_order (day_of_week, class_time, class_type, user_id, position)
  SELECT p_day_of_week, p_class_time, p_class_type, u.id, row_number() OVER (ORDER BY u.ord)
    FROM (SELECT DISTINCT ON (x.id) x.id, x.ord
            FROM unnest(coalesce(p_user_ids, '{}')) WITH ORDINALITY AS x(id, ord)
           ORDER BY x.id, x.ord) u
    JOIN profiles p ON p.id = u.id AND NOT p.is_demo;

  FOR v_class IN
    SELECT c.id FROM classes c
     WHERE c.class_date >= (now() AT TIME ZONE 'Europe/Madrid')::date
       AND extract(dow FROM c.class_date)::int = p_day_of_week
       AND c.class_time = p_class_time AND c.class_type = p_class_type
       AND EXISTS (SELECT 1 FROM class_waitlist w WHERE w.class_id = c.id)
  LOOP
    PERFORM public._waitlist_apply_slot_order(v_class);
  END LOOP;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.admin_set_slot_order(int, time, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_slot_order(int, time, text, uuid[]) TO authenticated;
