-- Contenido editable de la app sin publicar versión: textos de la portada
-- (WelcomeScreen) y título/subtítulo/imagen de las tarjetas del menú del socio.
--
-- La app trae los textos e imágenes originales dentro; esta tabla solo guarda
-- lo que el admin ha cambiado. Si una clave no existe, o la red falla, se usa
-- lo original (src/utils/appContent.ts).
--
-- Lectura pública (anon incluido): la portada se ve antes de iniciar sesión y
-- aquí no hay nada personal. Escritura: solo admin.

CREATE TABLE public.app_content (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.app_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_content_read_all ON public.app_content
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY app_content_admin_insert ON public.app_content
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY app_content_admin_update ON public.app_content
  FOR UPDATE TO authenticated USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY app_content_admin_delete ON public.app_content
  FOR DELETE TO authenticated USING ((SELECT public.is_admin()));

GRANT SELECT ON public.app_content TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.app_content TO authenticated;

-- Imágenes: bucket público (se sirven por URL a cualquiera, como la portada),
-- solo el admin sube, cambia o borra.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('app-content', 'app-content', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins upload app content images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'app-content' AND (SELECT public.is_admin()));

CREATE POLICY "Admins update app content images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'app-content' AND (SELECT public.is_admin()))
  WITH CHECK (bucket_id = 'app-content' AND (SELECT public.is_admin()));

CREATE POLICY "Admins delete app content images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'app-content' AND (SELECT public.is_admin()));
