-- ============================================================================
-- ROSTER PÚBLICO DE CLASES — 2026-07-11
--
-- Permite que CUALQUIER usuario vea quién está apuntado a cada clase, pero
-- exponiendo ÚNICAMENTE datos públicos: apodo (username) y foto (avatar_url).
-- Nunca nombre completo, email ni teléfono (esos siguen siendo admin-only por
-- la RLS de `profiles`).
--
-- Se hace con una vista SECURITY DEFINER (security_invoker = off): al ser
-- propiedad de `postgres` (dueño de las tablas), la vista se salta la RLS de
-- `bookings` y `profiles`, pero solo puede devolver las columnas que aquí
-- declaramos. Así no hace falta abrir esas tablas a lectura general.
-- ============================================================================

CREATE OR REPLACE VIEW public.class_roster
WITH (security_invoker = off) AS
SELECT
  b.class_id,
  b.user_id,
  p.username,
  p.avatar_url
FROM public.bookings b
JOIN public.profiles p ON p.id = b.user_id;

ALTER VIEW public.class_roster OWNER TO postgres;

REVOKE ALL ON public.class_roster FROM anon;
GRANT SELECT ON public.class_roster TO authenticated;
