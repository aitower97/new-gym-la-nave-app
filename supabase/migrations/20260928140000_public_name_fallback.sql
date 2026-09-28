-- Nombre público en roster y lista de espera: apodo o, si no hay, el nombre
-- de pila (sin apellidos). Hasta ahora quien no tenía apodo (26 de 71
-- socios) salía como "Usuario" entre los apuntados y "Sin nombre" en la
-- cola. El registro ya lo decía: "si se deja vacío, se usa el nombre"; el
-- nombre completo y el teléfono siguen siendo solo para el gimnasio.
--
-- La columna se sigue llamando `username` a propósito: las versiones de la
-- app ya instaladas leen ese campo y así lo arregla también para ellas.

CREATE OR REPLACE VIEW public.class_roster WITH (security_invoker = off) AS
 SELECT b.class_id,
    b.user_id,
    COALESCE(NULLIF(btrim(p.username), ''), NULLIF(split_part(btrim(p.full_name), ' ', 1), '')) AS username,
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
  SELECT w.class_id, w.user_id,
         COALESCE(NULLIF(btrim(p.username), ''), NULLIF(split_part(btrim(p.full_name), ' ', 1), '')),
         p.avatar_url,
         row_number() OVER (PARTITION BY w.class_id ORDER BY w.created_at)::int
  FROM public.class_waitlist w
  JOIN public.profiles p ON p.id = w.user_id
  WHERE w.class_id = ANY(p_class_ids)
    AND NOT p.is_demo
  ORDER BY w.class_id, w.created_at;
$function$;
