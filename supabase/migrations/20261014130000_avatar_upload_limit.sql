-- Límite de subidas de foto de perfil: 10 al día por usuario.
--
-- Por qué: cada uno solo puede escribir en su carpeta y como mucho 2 MB por
-- fichero, pero nada impedía subir cientos con un script (1 GB de
-- almacenamiento en el plan gratuito, y cada foto pasa por shrink-avatars).
-- Un socio normal sube una al cambiar su foto.
--
-- El conteo va en una función SECURITY DEFINER: una subconsulta a
-- storage.objects dentro de la política pasaría por la RLS de lectura (no hay
-- ninguna para avatars) y siempre contaría 0. Cuenta por owner_id: las
-- versiones que escribe shrink-avatars (service_role) no tienen dueño y no
-- cuentan.

CREATE OR REPLACE FUNCTION public.avatar_uploads_last_day() RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::int FROM storage.objects
  WHERE bucket_id = 'avatars'
    AND owner_id = (SELECT auth.uid())::text
    AND created_at > now() - interval '1 day'
$$;

REVOKE ALL ON FUNCTION public.avatar_uploads_last_day() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avatar_uploads_last_day() TO authenticated;

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
    AND public.avatar_uploads_last_day() < 10
  );
