-- La cola de espera de una clase, visible para cualquier socio autenticado.
--
-- Se expone con una función SECURITY DEFINER en vez de abrir la RLS de
-- class_waitlist porque, igual que en class_roster, solo deben salir datos
-- públicos: apodo y foto. Ni el id de la fila ni cuándo se apuntó cada uno.
--
-- Que el socio vea la cola es coherente con lo que ya ve: el roster le enseña
-- quién tiene plaza, con apodo y foto. Los que esperan son la misma gente.
-- Ocultarla no protegía nada y le dejaba sin saber cuántos hay por delante.
--
-- Recibe un array para resolver el día entero en una sola llamada: por clase
-- serían seis viajes para pintar una pantalla.
DROP FUNCTION IF EXISTS public.class_waitlist_public(uuid);

CREATE OR REPLACE FUNCTION public.class_waitlist_public(p_class_ids uuid[])
RETURNS TABLE (class_id uuid, user_id uuid, username text, avatar_url text, posicion int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT w.class_id, w.user_id, p.username, p.avatar_url,
         row_number() OVER (PARTITION BY w.class_id ORDER BY w.created_at)::int
  FROM public.class_waitlist w
  JOIN public.profiles p ON p.id = w.user_id
  WHERE w.class_id = ANY(p_class_ids)
  ORDER BY w.class_id, w.created_at;
$fn$;

REVOKE EXECUTE ON FUNCTION public.class_waitlist_public(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.class_waitlist_public(uuid[]) TO authenticated;
