-- ════════════════════════════════════════════════════════════════════════
-- Catálogo de ejercicios: oficiales (del entrenador) y propios (de cada socio)
-- ════════════════════════════════════════════════════════════════════════
--
-- Antes un ejercicio era solo un nombre escrito a mano en cada fila de
-- workout_exercises, y cualquier socio podía renombrar lo del entrenador.
-- Ahora cada fila apunta a un ejercicio del catálogo (exercise_id):
--   · Oficial: lo crea el entrenador/admin. Solo el admin lo renombra o une.
--   · Propio: lo crea un socio. Solo lo ven él y el admin; solo él lo renombra.
--   · Sinónimo (exercise_aliases): nombre que el ADMIN aprobó para un oficial.
--
-- Regla de oro: el sistema no decide uniones. Solo enlaza solo lo que ya se
-- agrupaba igual antes (mismo nombre salvo mayúsculas/espacios) o un sinónimo
-- que el admin aprobó. Lo demás (sinónimos de diccionario, erratas, carga
-- escrita en el nombre, repetidos del entrenador, nombres de varios socios)
-- le sale al admin como SUGERENCIA y él decide.
--
-- Las reglas viven aquí (no en la app): valen también para versiones antiguas,
-- que solo mandan el nombre. La columna name se conserva para ellas.
-- La migración NO cambia ningún nombre ni agrupación existente.

-- ── 1. Extensiones (solo para proponer sugerencias) ─────────────────────
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch WITH SCHEMA extensions;

-- ── 2. Claves de nombre ─────────────────────────────────────────────────
-- Estricta (enlace automático): como agrupaba "Mi progreso" hasta ahora,
-- minúsculas y espacios simples. "Press  Banca " = "press banca".
CREATE OR REPLACE FUNCTION public.exercise_key(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT lower(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')))
$$;

-- Carga escrita dentro del nombre: "esfuerzo 7", "esf 6-7", "rpe 8", "1x3", "1*3", "8/9", "75%"
CREATE OR REPLACE FUNCTION public.exercise_load_pattern() RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT '(\m(esfuerzo|esf|rpe)\M\s*[0-9.,/+-]*\+?|\m[0-9]+\s*[x*]\s*[0-9]+\M|\m[0-9]+\s*/\s*[0-9]+\M|[0-9]+\s*%)'::text
$$;

-- La carga que lleva el nombre ("esfuerzo 7"), o '' si no lleva
CREATE OR REPLACE FUNCTION public.exercise_load_part(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT coalesce(btrim(string_agg(btrim(m[1]), ' ')), '')
  FROM regexp_matches(coalesce(p, ''), public.exercise_load_pattern(), 'gi') AS m
$$;

-- Difusa (SOLO para sugerir): sin acentos, signos, "&"/"+"/"and" ni la carga.
-- "Press de Banca (esf 7)" → "press de banca"
CREATE OR REPLACE FUNCTION public.exercise_fuzzy_key(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  WITH s AS (
    SELECT regexp_replace(coalesce(p, ''), public.exercise_load_pattern(), ' ', 'gi') AS x
  )
  SELECT coalesce(nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           lower(extensions.unaccent('extensions.unaccent'::regdictionary, x)),
           '[&+]', ' and ', 'g'), '[^a-z0-9 ]', ' ', 'g'), '\mand\M', ' ', 'g'), '\s+', ' ', 'g')), ''),
         public.exercise_key(p))
  FROM s
$$;

-- ── 3. Tablas ───────────────────────────────────────────────────────────
CREATE TABLE public.exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 100),
  norm_name text NOT NULL,
  is_official boolean NOT NULL,
  owner_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  merged_into uuid REFERENCES public.exercises(id),
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercises_owner_matches_kind CHECK (is_official = (owner_id IS NULL))
);
CREATE UNIQUE INDEX exercises_official_key ON public.exercises (norm_name) WHERE is_official AND merged_into IS NULL;
CREATE UNIQUE INDEX exercises_personal_key ON public.exercises (owner_id, norm_name) WHERE NOT is_official AND merged_into IS NULL;
CREATE INDEX exercises_owner_idx ON public.exercises (owner_id);

-- Sinónimos aprobados por el admin (clave estricta → oficial)
CREATE TABLE public.exercise_aliases (
  norm_alias text PRIMARY KEY,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('admin', 'merge', 'rename')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exercise_aliases_exercise_idx ON public.exercise_aliases (exercise_id);

-- Diccionario de pistas: nombres que suelen ser el mismo ejercicio (mismo grupo).
-- Nunca une nada: solo sirve para proponer. Claves difusas.
CREATE TABLE public.exercise_hints (
  fuzzy_key text PRIMARY KEY,
  hint_group text NOT NULL
);

-- "Son distintos" (target_id) o "dejar como está" (target_id NULL).
-- source_key: 'p:<clave>' para propios de socios, 'o:<id>' para un oficial.
CREATE TABLE public.exercise_review_dismissals (
  source_key text NOT NULL,
  target_id uuid REFERENCES public.exercises(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercise_review_dismissals_key UNIQUE NULLS NOT DISTINCT (source_key, target_id)
);

ALTER TABLE public.workout_exercises
  ADD COLUMN exercise_id uuid REFERENCES public.exercises(id),
  ADD COLUMN typed_name text;
CREATE INDEX workout_exercises_exercise_idx ON public.workout_exercises (exercise_id);

ALTER TABLE public.exercise_library
  ADD COLUMN exercise_id uuid REFERENCES public.exercises(id);

-- ── 4. Permisos: los socios solo leen; todo lo que escribe va por funciones ─
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_hints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_review_dismissals ENABLE ROW LEVEL SECURITY;

-- Oficiales para todos; propios solo para su dueño; el admin lo ve todo
CREATE POLICY exercises_read ON public.exercises FOR SELECT TO authenticated
  USING (is_official OR owner_id = (SELECT auth.uid()) OR public.is_admin());
-- Sinónimos (pueden venir de nombres de socios), pistas y descartes: solo el admin
CREATE POLICY exercise_aliases_admin_read ON public.exercise_aliases FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY exercise_hints_admin_read ON public.exercise_hints FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY exercise_review_dismissals_admin_read ON public.exercise_review_dismissals FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON public.exercises, public.exercise_aliases, public.exercise_hints, public.exercise_review_dismissals FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.exercises, public.exercise_aliases, public.exercise_hints, public.exercise_review_dismissals FROM authenticated;

-- ── 5. Nombre y clave del ejercicio, siempre coherentes ─────────────────
CREATE OR REPLACE FUNCTION public.trg_exercises_normalize() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.name := btrim(regexp_replace(NEW.name, '\s+', ' ', 'g'));
  NEW.norm_name := public.exercise_key(NEW.name);
  IF NEW.norm_name = '' THEN RAISE EXCEPTION 'exercise name empty' USING ERRCODE = '22023'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_exercises_normalize BEFORE INSERT OR UPDATE OF name ON public.exercises
  FOR EACH ROW EXECUTE FUNCTION public.trg_exercises_normalize();

-- ── 6. Pistas de partida (solo proponen; el admin decide) ───────────────
INSERT INTO public.exercise_hints (fuzzy_key, hint_group)
SELECT public.exercise_fuzzy_key(k), g FROM (VALUES
  ('press banca', 'press banca'), ('press de banca', 'press banca'), ('bench press', 'press banca'),
  ('peso muerto', 'peso muerto'), ('deadlift', 'peso muerto'), ('peso muerto convencional', 'peso muerto'),
  ('sentadilla', 'sentadilla'), ('sentadillas', 'sentadilla'), ('back squat', 'sentadilla'), ('squat', 'sentadilla'),
  ('sentadilla barra', 'sentadilla'), ('sentad', 'sentadilla'),
  ('sentadilla frontal', 'sentadilla frontal'), ('front squat', 'sentadilla frontal'),
  ('press militar', 'press militar'), ('strict press', 'press militar'), ('shoulder press', 'press militar'),
  ('overhead press', 'press militar'), ('press militar estricto', 'press militar'), ('press militar strict press', 'press militar'),
  ('thruster', 'thruster'), ('thrusters', 'thruster'),
  ('kettlebell', 'kettlebell'), ('ketteble', 'kettlebell'), ('kettlebell swing', 'kettlebell'),
  ('zancadas', 'zancadas'), ('lunges', 'zancadas'),
  ('snatch', 'snatch'), ('arrancada', 'snatch'),
  ('clean', 'clean'), ('cargada', 'clean'),
  ('clean jerk', 'clean jerk'), ('dos tiempos', 'clean jerk'),
  ('dominadas', 'dominadas'), ('pull ups', 'dominadas'), ('pull up', 'dominadas')
) AS h(k, g)
ON CONFLICT (fuzzy_key) DO NOTHING;

-- ── 7. El resolutor: nombre → ejercicio (sin adivinar) ──────────────────
-- Interno (SECURITY DEFINER), cerrado a los clientes: si no, un socio podría
-- crear oficiales. Solo enlaza por clave estricta o sinónimo aprobado.
CREATE OR REPLACE FUNCTION public.resolve_exercise(p_name text, p_owner uuid, p_official boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text := public.exercise_key(p_name);
  v_id uuid;
BEGIN
  IF v_key = '' THEN RAISE EXCEPTION 'exercise name empty' USING ERRCODE = '22023'; END IF;

  SELECT e.id INTO v_id FROM exercises e WHERE e.is_official AND e.merged_into IS NULL AND e.norm_name = v_key;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT a.exercise_id INTO v_id FROM exercise_aliases a WHERE a.norm_alias = v_key;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  IF NOT p_official THEN
    SELECT e.id INTO v_id FROM exercises e
     WHERE NOT e.is_official AND e.merged_into IS NULL AND e.owner_id = p_owner AND e.norm_name = v_key;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;

  INSERT INTO exercises (name, is_official, owner_id, created_by)
  VALUES (p_name, p_official, CASE WHEN p_official THEN NULL ELSE p_owner END, auth.uid())
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN  -- otro guardado simultáneo lo acaba de crear
    SELECT e.id INTO v_id FROM exercises e
     WHERE e.merged_into IS NULL AND e.norm_name = v_key
       AND (CASE WHEN p_official THEN e.is_official ELSE e.owner_id = p_owner END);
  END IF;
  -- Nuevo oficial: los propios de socios con el mismo nombre (estricto) pasan a él
  IF p_official THEN PERFORM public._absorb_personals(v_id, v_key); END IF;
  RETURN v_id;
END $$;

-- ── 8. Unir ejercicios (interno, solo tras una decisión) ────────────────
-- Todo lo de p_source pasa a p_target. Si p_target es oficial, el nombre de
-- p_source queda como sinónimo. Nada se borra: p_source queda "unido".
-- La carga que llevaba el nombre de una fila ("esfuerzo 7") pasa a su nota.
CREATE OR REPLACE FUNCTION public._merge_exercise(p_source uuid, p_target uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s exercises%ROWTYPE;
  t exercises%ROWTYPE;
BEGIN
  SELECT * INTO s FROM exercises WHERE id = p_source;
  SELECT * INTO t FROM exercises WHERE id = p_target;
  WHILE t.merged_into IS NOT NULL LOOP SELECT * INTO t FROM exercises WHERE id = t.merged_into; END LOOP;
  IF s.id IS NULL OR t.id IS NULL OR s.id = t.id OR s.merged_into IS NOT NULL THEN RETURN; END IF;
  IF s.is_official AND NOT t.is_official THEN RAISE EXCEPTION 'official into personal' USING ERRCODE = '42501'; END IF;
  IF NOT s.is_official AND NOT t.is_official AND s.owner_id IS DISTINCT FROM t.owner_id THEN
    RAISE EXCEPTION 'personal of another member' USING ERRCODE = '42501';
  END IF;

  UPDATE workout_exercises w
     SET exercise_id = t.id,
         name = t.name,
         description = CASE WHEN coalesce(btrim(w.description), '') = '' AND public.exercise_load_part(coalesce(w.typed_name, w.name)) <> ''
                            THEN public.exercise_load_part(coalesce(w.typed_name, w.name)) ELSE w.description END
   WHERE w.exercise_id = s.id;

  -- Biblioteca: si el socio ya tenía el destino, sobra la del origen
  DELETE FROM exercise_library l WHERE l.exercise_id = s.id
     AND EXISTS (SELECT 1 FROM exercise_library o
                  WHERE o.user_id IS NOT DISTINCT FROM l.user_id AND (o.exercise_id = t.id OR o.name = t.name));
  UPDATE exercise_library SET exercise_id = t.id, name = t.name WHERE exercise_id = s.id;

  IF t.is_official THEN
    UPDATE exercise_aliases SET exercise_id = t.id WHERE exercise_id = s.id;
    IF s.norm_name <> t.norm_name THEN
      INSERT INTO exercise_aliases (norm_alias, exercise_id, source, created_by)
      VALUES (s.norm_name, t.id, 'merge', auth.uid()) ON CONFLICT (norm_alias) DO NOTHING;
    END IF;
  END IF;
  DELETE FROM exercise_review_dismissals WHERE target_id = s.id OR source_key = 'o:' || s.id;
  UPDATE exercises SET merged_into = t.id, archived_at = coalesce(archived_at, now()) WHERE id = s.id;

  IF t.is_official THEN PERFORM public._absorb_personals(t.id, s.norm_name); END IF;
END $$;

-- Propios de cualquier socio con esa clave estricta → al oficial
CREATE OR REPLACE FUNCTION public._absorb_personals(p_official uuid, p_key text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM exercises WHERE NOT is_official AND merged_into IS NULL AND norm_name = p_key LOOP
    PERFORM public._merge_exercise(r.id, p_official);
  END LOOP;
END $$;

-- ── 9. Carga inicial: enlazar sin cambiar nada de lo que se ve ──────────
-- Oficiales: biblioteca global y sesiones del entrenador (primero), después
-- los propios de los socios. Solo clave estricta: mismo agrupado que hoy.
-- Los nombres de las filas NO se tocan.
DO $$
DECLARE r record; v_id uuid;
BEGIN
  FOR r IN SELECT DISTINCT ON (public.exercise_key(name)) name FROM public.exercise_library
            WHERE user_id IS NULL ORDER BY public.exercise_key(name), created_at DESC LOOP
    PERFORM public.resolve_exercise(r.name, NULL, true);
  END LOOP;

  FOR r IN
    SELECT d.user_id, d.name FROM (SELECT DISTINCT user_id, name FROM public.workout_exercises) d
    ORDER BY (d.user_id IS NOT NULL), d.name
  LOOP
    v_id := public.resolve_exercise(r.name, r.user_id, r.user_id IS NULL);
    UPDATE public.workout_exercises w SET exercise_id = v_id, typed_name = w.name
     WHERE w.user_id IS NOT DISTINCT FROM r.user_id AND w.name = r.name;
  END LOOP;

  FOR r IN SELECT DISTINCT user_id, name FROM public.exercise_library LOOP
    v_id := public.resolve_exercise(r.name, r.user_id, r.user_id IS NULL);
    UPDATE public.exercise_library SET exercise_id = v_id
     WHERE user_id IS NOT DISTINCT FROM r.user_id AND name = r.name;
  END LOOP;
END $$;

ALTER TABLE public.workout_exercises ALTER COLUMN exercise_id SET NOT NULL;
ALTER TABLE public.exercise_library ALTER COLUMN exercise_id SET NOT NULL;

-- ── 10. Disparadores: toda fila nueva o cambiada queda enlazada ─────────
-- ¿La crea el entrenador? Filas sin socio, o las que mete un admin en el
-- entreno de un socio.
CREATE OR REPLACE FUNCTION public._exercise_row_is_official(p_row_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_row_user IS NULL OR (public.is_admin() AND auth.uid() IS DISTINCT FROM p_row_user)
$$;

CREATE OR REPLACE FUNCTION public.trg_link_exercise() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ex exercises%ROWTYPE;
  v_id uuid;
  v_is_workout boolean := TG_TABLE_NAME = 'workout_exercises';
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.exercise_id IS NOT DISTINCT FROM OLD.exercise_id THEN
    IF NEW.name IS NOT DISTINCT FROM OLD.name THEN RETURN NEW; END IF;
    -- Mismo ejercicio con otra forma de escribirlo (o cascada de un renombrado): se queda
    IF public.exercise_key(NEW.name) = (SELECT e.norm_name FROM exercises e WHERE e.id = NEW.exercise_id)
       OR NEW.name = (SELECT e.name FROM exercises e WHERE e.id = NEW.exercise_id) THEN
      RETURN NEW;
    END IF;
    NEW.exercise_id := NULL;  -- nombre nuevo de verdad: se vuelve a enlazar
  END IF;

  IF NEW.exercise_id IS NOT NULL THEN
    -- Viene elegido (app nueva): oficial, o propio del socio de la fila
    SELECT * INTO v_ex FROM exercises WHERE id = NEW.exercise_id;
    WHILE FOUND AND v_ex.merged_into IS NOT NULL LOOP
      SELECT * INTO v_ex FROM exercises WHERE id = v_ex.merged_into;
    END LOOP;
    IF v_ex.id IS NULL OR NOT (v_ex.is_official OR v_ex.owner_id IS NOT DISTINCT FROM NEW.user_id) THEN
      RAISE EXCEPTION 'exercise not allowed for this row' USING ERRCODE = '42501';
    END IF;
    IF NEW.user_id IS NULL AND NOT v_ex.is_official THEN
      RAISE EXCEPTION 'trainer rows only use official exercises' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- Solo nombre (versiones antiguas, o cambio de nombre en una sesión).
    -- Primero a una variable: dentro de un WHERE, el resolutor (que crea
    -- ejercicios) se ejecutaría por cada fila y no vería el que acaba de crear.
    v_id := public.resolve_exercise(NEW.name, NEW.user_id, public._exercise_row_is_official(NEW.user_id));
    SELECT * INTO v_ex FROM exercises WHERE id = v_id;
  END IF;

  IF v_is_workout THEN
    IF TG_OP = 'INSERT' THEN
      NEW.typed_name := NEW.name;
    ELSIF NEW.name IS DISTINCT FROM OLD.name THEN
      NEW.typed_name := NEW.name;
    END IF;
  END IF;
  NEW.exercise_id := v_ex.id;
  NEW.name := v_ex.name;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_link_exercise BEFORE INSERT OR UPDATE OF name, exercise_id ON public.workout_exercises
  FOR EACH ROW EXECUTE FUNCTION public.trg_link_exercise();
CREATE TRIGGER trg_link_exercise BEFORE INSERT OR UPDATE OF name, exercise_id ON public.exercise_library
  FOR EACH ROW EXECUTE FUNCTION public.trg_link_exercise();

-- Renombrar un ejercicio cambia el nombre en todas sus filas
CREATE OR REPLACE FUNCTION public.trg_exercise_rename_cascade() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE workout_exercises SET name = NEW.name WHERE exercise_id = NEW.id AND name IS DISTINCT FROM NEW.name;
  UPDATE exercise_library SET name = NEW.name WHERE exercise_id = NEW.id AND name IS DISTINCT FROM NEW.name;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_exercise_rename_cascade AFTER UPDATE OF name ON public.exercises
  FOR EACH ROW WHEN (OLD.name IS DISTINCT FROM NEW.name) EXECUTE FUNCTION public.trg_exercise_rename_cascade();

-- ── 11. Sugerencias para el admin ───────────────────────────────────────
-- kind: 'merge' (unir origen → destino) o 'make_official' (propio de 2+ socios).
-- reason: 'nombre', 'sinonimo', 'errata', 'contiene', 'varios_socios'.
CREATE OR REPLACE FUNCTION public._exercise_suggestions()
RETURNS TABLE (source_key text, source_name text, source_official boolean, members int, logs int,
               kind text, target_id uuid, target_name text, reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  WITH uses AS (
    SELECT w.exercise_id, count(DISTINCT coalesce(l.user_id, w.user_id)) AS members, count(l.id) AS logs
    FROM workout_exercises w LEFT JOIN workout_logs l ON l.exercise_id = w.id
    GROUP BY w.exercise_id
  ),
  o AS (
    SELECT e.id, e.name, public.exercise_fuzzy_key(e.name) AS fk, coalesce(u.logs, 0) AS logs,
           coalesce(u.members, 0) AS members, h.hint_group
    FROM exercises e LEFT JOIN uses u ON u.exercise_id = e.id
    LEFT JOIN exercise_hints h ON h.fuzzy_key = public.exercise_fuzzy_key(e.name)
    WHERE e.is_official AND e.merged_into IS NULL AND e.archived_at IS NULL
  ),
  -- Propios agrupados por nombre (todos los socios que lo escribieron igual)
  p AS (
    SELECT 'p:' || e.norm_name AS source_key, min(e.name) AS source_name, public.exercise_fuzzy_key(min(e.name)) AS fk,
           count(DISTINCT e.owner_id)::int AS members, coalesce(sum(u.logs), 0)::int AS logs
    FROM exercises e LEFT JOIN uses u ON u.exercise_id = e.id
    WHERE NOT e.is_official AND e.merged_into IS NULL
    GROUP BY e.norm_name
  ),
  src AS (
    SELECT p.source_key, p.source_name, false AS source_official, p.fk, p.members, p.logs, NULL::uuid AS source_id,
           (SELECT h.hint_group FROM exercise_hints h WHERE h.fuzzy_key = p.fk) AS hint_group
    FROM p
    UNION ALL
    SELECT 'o:' || o.id, o.name, true, o.fk, o.members::int, o.logs::int, o.id, o.hint_group FROM o
  ),
  cand AS (
    SELECT s.*, t.id AS target_id, t.name AS target_name,
      CASE WHEN s.fk = t.fk THEN 1
           WHEN s.hint_group IS NOT NULL AND s.hint_group = t.hint_group THEN 2
           WHEN length(s.fk) >= 5 AND levenshtein(left(s.fk, 255), left(t.fk, 255)) <= CASE WHEN length(s.fk) <= 8 THEN 1 ELSE 2 END THEN 3
           -- "Contiene" solo para nombres de socios: entre ejercicios del
           -- entrenador ("Power Clean" / "Clean") suelen ser distintos
           WHEN NOT s.source_official AND ' ' || s.fk || ' ' LIKE '% ' || t.fk || ' %' THEN 4
      END AS prio,
      length(t.fk) AS tlen, t.logs AS tlogs
    FROM src s JOIN o t ON t.id IS DISTINCT FROM s.source_id
    WHERE NOT EXISTS (SELECT 1 FROM exercise_review_dismissals d
                       WHERE d.source_key = s.source_key AND (d.target_id = t.id OR d.target_id IS NULL))
      -- Entre dos oficiales, solo se propone unir el menos usado en el más usado
      AND (NOT s.source_official OR (s.logs, s.source_name) < (t.logs, t.name) OR s.fk = t.fk AND s.logs < t.logs)
  ),
  best AS (
    SELECT DISTINCT ON (c.source_key) c.*
    FROM cand c WHERE c.prio IS NOT NULL
    ORDER BY c.source_key, c.prio, c.tlen DESC, c.tlogs DESC
  )
  SELECT b.source_key, b.source_name, b.source_official, b.members, b.logs, 'merge', b.target_id, b.target_name,
         CASE b.prio WHEN 1 THEN 'nombre' WHEN 2 THEN 'sinonimo' WHEN 3 THEN 'errata' ELSE 'contiene' END
  FROM best b
  UNION ALL
  SELECT p.source_key, p.source_name, false, p.members, p.logs, 'make_official', NULL, NULL, 'varios_socios'
  FROM p
  WHERE p.members >= 2
    AND NOT EXISTS (SELECT 1 FROM best b WHERE b.source_key = p.source_key)
    AND NOT EXISTS (SELECT 1 FROM exercise_review_dismissals d WHERE d.source_key = p.source_key AND d.target_id IS NULL)
  ORDER BY 5 DESC, 4 DESC
$$;

CREATE OR REPLACE FUNCTION public.exercise_review_queue()
RETURNS TABLE (source_key text, source_name text, source_official boolean, members int, logs int,
               kind text, target_id uuid, target_name text, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM public._exercise_suggestions();
END $$;

-- ── 12. Decisiones del admin ────────────────────────────────────────────

-- "Unir": el origen (propios con ese nombre, o un oficial) pasa al destino oficial
CREATE OR REPLACE FUNCTION public.admin_accept_exercise_merge(p_source_key text, p_target uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text; v_src uuid;
BEGIN
  IF NOT public.is_admin() THEN RETURN 'not_allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM exercises WHERE id = p_target AND is_official AND merged_into IS NULL) THEN RETURN 'invalid'; END IF;
  IF p_source_key LIKE 'p:%' THEN
    v_key := substr(p_source_key, 3);
    INSERT INTO exercise_aliases (norm_alias, exercise_id, source, created_by)
    SELECT v_key, p_target, 'admin', auth.uid()
     WHERE NOT EXISTS (SELECT 1 FROM exercises WHERE is_official AND merged_into IS NULL AND norm_name = v_key)
    ON CONFLICT (norm_alias) DO UPDATE SET exercise_id = EXCLUDED.exercise_id, source = 'admin';
    PERFORM public._absorb_personals(p_target, v_key);
  ELSIF p_source_key LIKE 'o:%' THEN
    v_src := substr(p_source_key, 3)::uuid;
    IF NOT EXISTS (SELECT 1 FROM exercises WHERE id = v_src AND is_official) THEN RETURN 'invalid'; END IF;
    PERFORM public._merge_exercise(v_src, p_target);
  ELSE
    RETURN 'invalid';
  END IF;
  RETURN 'ok';
END $$;

-- "Hacer oficial": un nombre que usan socios pasa al catálogo
CREATE OR REPLACE FUNCTION public.admin_make_official(p_source_key text, p_name text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_key text := substr(p_source_key, 3);
BEGIN
  IF NOT public.is_admin() THEN RETURN 'not_allowed'; END IF;
  IF p_source_key NOT LIKE 'p:%' OR public.exercise_key(p_name) = '' THEN RETURN 'invalid'; END IF;
  SELECT id INTO v_id FROM exercises WHERE is_official AND merged_into IS NULL AND norm_name = public.exercise_key(p_name);
  IF v_id IS NULL THEN
    INSERT INTO exercises (name, is_official, created_by) VALUES (p_name, true, auth.uid()) RETURNING id INTO v_id;
  END IF;
  IF v_key <> public.exercise_key(p_name) THEN
    INSERT INTO exercise_aliases (norm_alias, exercise_id, source, created_by)
    VALUES (v_key, v_id, 'admin', auth.uid()) ON CONFLICT (norm_alias) DO NOTHING;
  END IF;
  PERFORM public._absorb_personals(v_id, v_key);
  PERFORM public._absorb_personals(v_id, public.exercise_key(p_name));
  RETURN 'ok';
END $$;

-- "Son distintos" (p_target) o "dejar como está" (p_target NULL)
CREATE OR REPLACE FUNCTION public.admin_dismiss_exercise_review(p_source_key text, p_target uuid DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN 'not_allowed'; END IF;
  INSERT INTO exercise_review_dismissals (source_key, target_id, created_by)
  VALUES (p_source_key, p_target, auth.uid()) ON CONFLICT ON CONSTRAINT exercise_review_dismissals_key DO NOTHING;
  RETURN 'ok';
END $$;

-- Desde el catálogo: unir un oficial (o un propio) en otro oficial
CREATE OR REPLACE FUNCTION public.admin_merge_exercises(p_source uuid, p_target uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN 'not_allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM exercises WHERE id = p_target AND is_official) THEN RETURN 'invalid'; END IF;
  PERFORM public._merge_exercise(p_source, p_target);
  RETURN 'ok';
END $$;

CREATE OR REPLACE FUNCTION public.admin_archive_exercise(p_id uuid, p_archived boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RETURN 'not_allowed'; END IF;
  UPDATE exercises SET archived_at = CASE WHEN p_archived THEN now() END
   WHERE id = p_id AND is_official AND merged_into IS NULL;
  RETURN CASE WHEN FOUND THEN 'ok' ELSE 'not_found' END;
END $$;

-- ── 13. Funciones para la app (socios y admin) ──────────────────────────

-- Buscador al añadir un ejercicio: oficiales y los propios de quien busca.
-- Aquí sí se busca por parecido: el socio elige, nada se une solo.
CREATE OR REPLACE FUNCTION public.suggest_exercises(p_query text, p_limit int DEFAULT 8)
RETURNS TABLE (id uuid, name text, is_official boolean, score int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  WITH q AS (SELECT public.exercise_fuzzy_key(p_query) AS k),
  pool AS (
    SELECT e.id, e.name, e.is_official, public.exercise_fuzzy_key(e.name) AS key FROM exercises e
     WHERE e.merged_into IS NULL AND e.archived_at IS NULL AND (e.is_official OR e.owner_id = auth.uid())
    UNION ALL
    SELECT e.id, e.name, true, public.exercise_fuzzy_key(a.norm_alias) FROM exercise_aliases a JOIN exercises e ON e.id = a.exercise_id
     WHERE e.merged_into IS NULL AND e.archived_at IS NULL
  ),
  ranked AS (
    SELECT p.id, p.name, p.is_official,
      CASE WHEN q.k = '' THEN 5
           WHEN p.key = q.k THEN 0
           WHEN p.key LIKE q.k || '%' THEN 1
           WHEN p.key LIKE '%' || q.k || '%' THEN 2
           WHEN length(q.k) >= 4 AND levenshtein(left(p.key, 255), left(q.k, 255)) <= 2 THEN 3
      END AS score
    FROM pool p, q
  )
  SELECT b.id, b.name, b.is_official, b.score FROM (
    SELECT DISTINCT ON (r.id) r.id, r.name, r.is_official, r.score
    FROM ranked r WHERE r.score IS NOT NULL
    ORDER BY r.id, r.score
  ) b
  ORDER BY b.score, b.is_official DESC, b.name
  LIMIT greatest(1, least(coalesce(p_limit, 8), 50))
$$;

-- Renombrar por id. Socio: solo sus propios. Admin: cualquiera.
-- ok · needs_merge · official · not_allowed · not_found · invalid
CREATE OR REPLACE FUNCTION public.rename_exercise_by_id(p_exercise_id uuid, p_new_name text, p_merge boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e exercises%ROWTYPE;
  v_admin boolean := public.is_admin();
  v_name text := btrim(regexp_replace(coalesce(p_new_name, ''), '\s+', ' ', 'g'));
  v_key text := public.exercise_key(p_new_name);
  v_target uuid;
BEGIN
  SELECT * INTO e FROM exercises WHERE id = p_exercise_id;
  WHILE FOUND AND e.merged_into IS NOT NULL LOOP SELECT * INTO e FROM exercises WHERE id = e.merged_into; END LOOP;
  IF e.id IS NULL THEN RETURN 'not_found'; END IF;
  IF e.is_official AND NOT v_admin THEN RETURN 'official'; END IF;
  IF NOT e.is_official AND NOT v_admin AND e.owner_id IS DISTINCT FROM auth.uid() THEN RETURN 'not_allowed'; END IF;
  IF v_key = '' OR length(v_name) > 100 THEN RETURN 'invalid'; END IF;

  IF v_key = e.norm_name THEN
    UPDATE exercises SET name = v_name WHERE id = e.id;  -- solo mayúsculas/espacios
    RETURN 'ok';
  END IF;

  -- ¿Ya existe con ese nombre? Un oficial (o su sinónimo), o un propio del mismo socio
  SELECT x.id INTO v_target FROM exercises x WHERE x.is_official AND x.merged_into IS NULL AND x.norm_name = v_key;
  IF v_target IS NULL THEN SELECT a.exercise_id INTO v_target FROM exercise_aliases a WHERE a.norm_alias = v_key; END IF;
  IF v_target IS NULL AND NOT e.is_official THEN
    SELECT x.id INTO v_target FROM exercises x
     WHERE NOT x.is_official AND x.merged_into IS NULL AND x.owner_id = e.owner_id AND x.norm_name = v_key;
  END IF;

  IF v_target IS NOT NULL AND v_target <> e.id THEN
    IF NOT p_merge THEN RETURN 'needs_merge'; END IF;
    PERFORM public._merge_exercise(e.id, v_target);
    RETURN 'ok';
  END IF;

  IF e.is_official THEN
    -- El nombre viejo de un oficial sigue llevando a él (lo decidió el admin)
    INSERT INTO exercise_aliases (norm_alias, exercise_id, source, created_by)
    VALUES (e.norm_name, e.id, 'rename', auth.uid()) ON CONFLICT (norm_alias) DO NOTHING;
    UPDATE exercises SET name = v_name WHERE id = e.id;
    PERFORM public._absorb_personals(e.id, v_key);
  ELSE
    UPDATE exercises SET name = v_name WHERE id = e.id;
  END IF;
  RETURN 'ok';
END $$;

-- La de la 1.20 (por nombre), sobre el modelo nuevo. Un oficial devuelve 'official'.
CREATE OR REPLACE FUNCTION public.rename_exercise(p_user_id uuid, p_old_name text, p_new_name text, p_merge boolean DEFAULT false)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_user_id IS NULL OR NOT (public.is_admin() OR p_user_id = auth.uid()) THEN RETURN 'not_allowed'; END IF;
  SELECT w.exercise_id INTO v_id FROM workout_exercises w
   WHERE public.exercise_key(w.name) = public.exercise_key(p_old_name)
     AND (w.user_id = p_user_id OR (w.user_id IS NULL AND EXISTS (
          SELECT 1 FROM workout_logs l WHERE l.exercise_id = w.id AND l.user_id = p_user_id)))
   LIMIT 1;
  IF v_id IS NULL THEN
    SELECT x.id INTO v_id FROM exercises x
     WHERE x.merged_into IS NULL AND x.norm_name = public.exercise_key(p_old_name)
       AND (x.is_official OR x.owner_id = p_user_id)
     ORDER BY x.is_official LIMIT 1;
  END IF;
  IF v_id IS NULL THEN RETURN 'not_found'; END IF;
  RETURN public.rename_exercise_by_id(v_id, p_new_name, p_merge);
END $$;

-- Aviso semanal al admin si hay sugerencias (se programa al publicar la app)
CREATE OR REPLACE FUNCTION public.notify_exercise_review() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
  v_title text := 'Ejercicios por revisar';
  v_body text;
  v_tokens text[];
BEGIN
  SELECT count(*) INTO v_count FROM public._exercise_suggestions();
  IF v_count = 0 THEN RETURN 0; END IF;
  v_body := v_count || CASE WHEN v_count = 1 THEN ' sugerencia' ELSE ' sugerencias' END || ' para ordenar los ejercicios.';

  INSERT INTO notifications (user_id, type, title, message, icon_key)
  SELECT r.user_id, 'exercise_review', v_title, v_body, 'barbell' FROM user_roles r WHERE r.role = 'admin';

  SELECT array_agg(t.token) INTO v_tokens
  FROM push_tokens t JOIN user_roles r ON r.user_id = t.user_id AND r.role = 'admin';
  IF v_tokens IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := (SELECT jsonb_agg(jsonb_build_object('to', t, 'sound', 'default', 'title', v_title, 'body', v_body,
                 'data', jsonb_build_object('type', 'exercise_review'))) FROM unnest(v_tokens) AS t)
    );
  END IF;
  RETURN v_count;
END $$;

-- ── 14. Quién puede ejecutar qué ────────────────────────────────────────
-- Internas: nadie desde la app ("FROM anon" no basta: FROM PUBLIC)
REVOKE ALL ON FUNCTION public.resolve_exercise(text, uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._merge_exercise(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._absorb_personals(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._exercise_suggestions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._exercise_row_is_official(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_exercise_review() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_link_exercise() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_exercise_rename_cascade() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_exercises_normalize() FROM PUBLIC, anon, authenticated;

-- De la app (cada una comprueba dentro quién llama)
REVOKE ALL ON FUNCTION public.suggest_exercises(text, int), public.rename_exercise_by_id(uuid, text, boolean),
  public.rename_exercise(uuid, text, text, boolean), public.exercise_review_queue(),
  public.admin_accept_exercise_merge(text, uuid), public.admin_make_official(text, text),
  public.admin_dismiss_exercise_review(text, uuid), public.admin_merge_exercises(uuid, uuid),
  public.admin_archive_exercise(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.suggest_exercises(text, int), public.rename_exercise_by_id(uuid, text, boolean),
  public.rename_exercise(uuid, text, text, boolean), public.exercise_review_queue(),
  public.admin_accept_exercise_merge(text, uuid), public.admin_make_official(text, text),
  public.admin_dismiss_exercise_review(text, uuid), public.admin_merge_exercises(uuid, uuid),
  public.admin_archive_exercise(uuid, boolean) TO authenticated;

-- El aviso semanal (lunes 08:00 UTC) se programa cuando la app con la
-- pantalla de revisión esté publicada:
--   SELECT cron.schedule('exercise-review-weekly', '0 8 * * 1', 'SELECT public.notify_exercise_review()');
