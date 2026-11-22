-- Rendimiento y escala (noviembre 2026). Nada de esto cambia QUIÉN puede ver
-- o hacer qué: solo cuántas veces se calcula y cuántos viajes hace la app.
--
-- 1. Políticas RLS: 33 llamaban a is_admin() a pelo, que Postgres evalúa en
--    CADA fila leída (es SECURITY DEFINER, no se puede "inlinear"). Envuelta
--    en (SELECT is_admin()) se calcula una vez por consulta. Misma condición.
-- 2. Índices para columnas que se cruzan siempre y no tenían.
-- 3. Funciones de lectura que juntan en un viaje lo que la app pedía en
--    varios (Reservas, listas de espera, cupo de todos los socios). Las
--    antiguas siguen ahí: la versión de las tiendas las sigue usando.

-- ── 1. is_admin() una vez por consulta ─────────────────────────────────────
DO $$
DECLARE
  p record;
  q text;
  c text;
  re constant text := '(?<!SELECT )is_admin\(\)';
BEGIN
  FOR p IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') ~ re OR coalesce(with_check, '') ~ re)
  LOOP
    q := regexp_replace(p.qual, re, '(SELECT is_admin())', 'g');
    c := regexp_replace(p.with_check, re, '(SELECT is_admin())', 'g');
    IF q IS NOT NULL AND c IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)', p.policyname, p.tablename, q, c);
    ELSIF q IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s)', p.policyname, p.tablename, q);
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)', p.policyname, p.tablename, c);
    END IF;
  END LOOP;
END $$;

-- ── 2. Índices ─────────────────────────────────────────────────────────────
-- Marcas por ejercicio (historial, progreso, cascada al borrar)
CREATE INDEX IF NOT EXISTS idx_workout_logs_exercise ON public.workout_logs (exercise_id);
-- Ejercicios propios de cada socio
CREATE INDEX IF NOT EXISTS idx_workout_exercises_user ON public.workout_exercises (user_id) WHERE user_id IS NOT NULL;
-- Avisos de un socio, los más recientes primero
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
-- Reservas por clase (roster, cupo, asistencia)
CREATE INDEX IF NOT EXISTS idx_bookings_class ON public.bookings (class_id);

-- ── 3a. Reservas: un día entero en un viaje ────────────────────────────────
-- Lo mismo que pedía ReservationScreen en tres tandas: las clases del día,
-- quién está apuntado (class_roster: solo apodo y foto), quién espera
-- (class_waitlist_public) y en qué colas está quien pregunta. SECURITY
-- INVOKER: cada parte respeta los permisos que ya tenía.
CREATE OR REPLACE FUNCTION public.day_schedule(p_date date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_ids uuid[];
  v_classes jsonb;
BEGIN
  SELECT coalesce(array_agg(c.id ORDER BY c.class_time), '{}'),
         coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.class_time), '[]')
    INTO v_ids, v_classes
  FROM classes c
  WHERE c.class_date = p_date;

  RETURN jsonb_build_object(
    'classes', v_classes,
    'roster', coalesce((
      SELECT jsonb_agg(jsonb_build_object('class_id', r.class_id, 'user_id', r.user_id, 'username', r.username, 'avatar_url', r.avatar_url))
      FROM class_roster r WHERE r.class_id = ANY(v_ids)), '[]'),
    'waitlist', coalesce((
      SELECT jsonb_agg(to_jsonb(w))
      FROM class_waitlist_public(v_ids) w), '[]')
  );
END $$;

REVOKE ALL ON FUNCTION public.day_schedule(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.day_schedule(date) TO authenticated;

-- ── 3b. Mis listas de espera con su puesto, en un viaje ────────────────────
-- Sustituye a "class_waitlist + waitlist_position por cada cola". Mismo
-- cálculo que waitlist_position (puesto = los que llegaron antes + 1).
CREATE OR REPLACE FUNCTION public.my_waitlist_entries()
RETURNS TABLE (class_id uuid, posicion int, total int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.class_id,
         (SELECT count(*)::int + 1 FROM class_waitlist w2
           WHERE w2.class_id = w.class_id AND w2.created_at < w.created_at),
         (SELECT count(*)::int FROM class_waitlist w4 WHERE w4.class_id = w.class_id)
  FROM class_waitlist w
  WHERE w.user_id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION public.my_waitlist_entries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_waitlist_entries() TO authenticated;

-- ── 3c. Clases usadas de muchos socios a la vez (panel de admin) ───────────
-- La app calcula la ventana de cada uno (mes, bono…) y aquí solo se cuenta.
-- Antes se descargaban TODAS sus reservas y PostgREST corta a 1.000 filas:
-- con 2.000 reservas el contador salía mal. SECURITY INVOKER: un socio que
-- la llame solo cuenta las suyas (RLS de bookings).
-- p_windows: [{"user_id": "...", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD"}], "to" excluido
CREATE OR REPLACE FUNCTION public.quota_usage(p_windows jsonb)
RETURNS TABLE (user_id uuid, used int)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT v.user_id,
         (SELECT count(*)::int FROM bookings b JOIN classes c ON c.id = b.class_id
           WHERE b.user_id = v.user_id AND c.class_date >= v."from" AND c.class_date < v."to")
  FROM jsonb_to_recordset(p_windows) AS v(user_id uuid, "from" date, "to" date);
$$;

REVOKE ALL ON FUNCTION public.quota_usage(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quota_usage(jsonb) TO authenticated;
