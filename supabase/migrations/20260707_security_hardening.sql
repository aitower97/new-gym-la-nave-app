-- ============================================================================
-- ENDURECIMIENTO DE SEGURIDAD — 2026-07-07
--
-- Hallazgos del linter automático de Supabase (`supabase db advisors`) tras
-- consolidar las políticas RLS. Aplicado directamente en remoto vía
-- `supabase db query`; este archivo documenta los cambios para el repo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Funciones RPC huérfanas — no las llama ningún código de la app (grep
--    sobre src/ sin resultados) ni ningún trigger/función de la base de datos
--    (verificado con pg_get_functiondef y pg_trigger antes de borrar).
--    Eran SECURITY DEFINER que reciben un user_uuid arbitrario y son
--    invocables sin autenticar vía /rest/v1/rpc/<nombre> — permitían a
--    cualquiera consultar el plan de membresía, el nº de reservas o el rol
--    de admin de CUALQUIER usuario a partir de su UUID.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.is_admin(uuid);
DROP FUNCTION IF EXISTS public.get_active_plan(uuid);
DROP FUNCTION IF EXISTS public.count_user_bookings_this_week(uuid);

-- ----------------------------------------------------------------------------
-- 2. is_admin() (la versión sin argumentos, creada en 20260702) seguía siendo
--    ejecutable por `anon` porque REVOKE ALL ... FROM anon no revoca el
--    privilegio heredado de PUBLIC (Postgres concede EXECUTE a PUBLIC por
--    defecto en toda función nueva). Aunque devuelve siempre `false` para
--    anon (auth.uid() es NULL), se cierra por higiene/defensa en profundidad.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Bucket `avatars`: la política SELECT "Anyone can view avatars" permitía
--    LISTAR todo el contenido del bucket (storage.objects) sin autenticar,
--    exponiendo los UUID de todos los usuarios con avatar y sus nombres de
--    fichero. No hace falta para que las fotos se sigan viendo: el bucket es
--    público a nivel de `storage.buckets.public = true`, que sirve los
--    ficheros por URL pública sin pasar por RLS. Solo bloqueaba el listado.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
