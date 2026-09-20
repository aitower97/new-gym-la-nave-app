-- ============================================================================
-- HARDENING DE SEGURIDAD — 2026-09-19
--
-- Cierra los hallazgos del linter de Supabase que son accionables. Lo que se
-- deja intencionadamente como está va explicado al final del fichero: no es
-- olvido.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. class_roster: acotar a la ventana que la app realmente muestra
--
-- La vista es SECURITY DEFINER a propósito (ver 20260711_public_class_roster)
-- y eso está bien: se salta la RLS de `bookings`/`profiles` pero solo expone
-- apodo y foto. El problema era que no filtraba filas.
--
-- El filtro por clase lo ponía únicamente el cliente
-- (ReservationScreen.tsx, `.in('class_id', classIds)`), así que cualquier
-- socio logueado podía pedir /rest/v1/class_roster sin filtro y llevarse el
-- historial de asistencia completo del gimnasio — qué días y a qué horas
-- entrena cada socio, incluido histórico que la app nunca enseña.
--
-- La ventana -30/+60 días es exactamente el rango que genera
-- `generateWeekDays()` en ReservationScreen, así que no cambia nada de lo que
-- se ve en pantalla.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.class_roster
WITH (security_invoker = off) AS
SELECT
  b.class_id,
  b.user_id,
  p.username,
  p.avatar_url
FROM public.bookings b
JOIN public.profiles p ON p.id = b.user_id
JOIN public.classes  c ON c.id = b.class_id
WHERE c.class_date BETWEEN current_date - 30 AND current_date + 60;

ALTER VIEW public.class_roster OWNER TO postgres;

-- La migración original concedía solo SELECT, pero los default privileges de
-- Supabase habían dado ALL a `authenticated` (INSERT/UPDATE/DELETE/TRUNCATE).
-- No era explotable —una vista con JOIN no es actualizable— pero sobra.
REVOKE ALL ON public.class_roster FROM anon, authenticated;
GRANT SELECT ON public.class_roster TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. Funciones de trigger: quitarlas de la API REST
--
-- Son SECURITY DEFINER y PostgREST las expone en /rest/v1/rpc/<nombre>.
-- No son explotables (una función de trigger invocada fuera de un trigger
-- aborta porque no existe NEW), pero no pintan nada en la API.
--
-- 20260821_fix_minor_findings.sql ya hizo REVOKE ... FROM PUBLIC sobre
-- handle_new_user y el advisor seguía avisando: Supabase concede EXECUTE
-- explícitamente a `anon` y `authenticated` ADEMÁS de a PUBLIC, así que
-- revocar solo de PUBLIC no basta. Hay que nombrarlos.
--
-- Revocar EXECUTE no impide que el trigger dispare: al ejecutarse como
-- trigger no se comprueba el privilegio del usuario que provoca la operación.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_self_plan_change()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_self_role_change()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_self_template_flag_change() FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. Cerrar a `anon` lo que no necesita ver nadie sin sesión
--
-- Estas cuatro tablas tenían políticas SELECT con rol `public`, que incluye
-- `anon`. Como la anon key viaja dentro del bundle de la app, en la práctica
-- eran legibles por cualquiera sin registrarse: horarios, tipos de clase,
-- precios de los planes y el booking_cutoff_hours.
--
-- No hay datos personales ahí, pero tampoco hay motivo para exponerlo:
-- Welcome/Login/Register no consultan ninguna tabla, así que toda lectura
-- real ocurre con sesión iniciada.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Todos pueden ver las clases" ON public.classes;
CREATE POLICY "Todos pueden ver las clases" ON public.classes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone read class types" ON public.class_types;
CREATE POLICY "Anyone read class types" ON public.class_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can select membership_plans" ON public.membership_plans;
CREATE POLICY "Anyone can select membership_plans" ON public.membership_plans
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "app_settings_select_all" ON public.app_settings;
CREATE POLICY "app_settings_select_all" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

-- EXCEPCIÓN: `latest_app_version` sí tiene que ser legible sin sesión.
-- UpdateAvailableModal se monta en la raíz (App.tsx), o sea antes del login,
-- y es la puerta que bloquea a los clientes Android desactualizados.
-- Si se cerrara a `anon`, la consulta no fallaría: la RLS devolvería cero
-- filas, getLatestAndroidVersion() caería en su `|| '0.0.0'` e isVersionBelow
-- daría false. Es decir, la actualización forzosa dejaría de aplicarse en
-- silencio a quien abra la app sin sesión. Se expone solo esa clave;
-- booking_cutoff_hours sigue requiriendo sesión.
DROP POLICY IF EXISTS "app_settings_anon_read_version" ON public.app_settings;
CREATE POLICY "app_settings_anon_read_version" ON public.app_settings
  FOR SELECT TO anon USING (key = 'latest_app_version');

-- Las políticas de admin que quedaban con rol `public` hay que acotarlas
-- también. Si no, al cerrar la lectura de arriba el único policy que le queda
-- a `anon` es el de admin, que llama a is_admin() — y `anon` no tiene EXECUTE
-- sobre esa función, así que la petición muere con «permission denied for
-- function is_admin» (un 500) en vez de devolver vacío limpiamente.
-- `classes` y `membership_plans` ya tenían las suyas en `authenticated`.
DROP POLICY IF EXISTS "Admins insert/delete class types" ON public.class_types;
CREATE POLICY "Admins insert/delete class types" ON public.class_types
  FOR ALL TO authenticated USING (is_admin());

-- Estas dos son INSERT/UPDATE, así que hoy no se evalúan en un SELECT, pero
-- dejarlas en `public` reproduciría el mismo 500 ante cualquier intento de
-- escritura sin sesión. Se recrean sin WITH CHECK explícito en el UPDATE:
-- Postgres reutiliza la expresión de USING, que es la semántica actual.
DROP POLICY IF EXISTS "app_settings_admin_insert" ON public.app_settings;
CREATE POLICY "app_settings_admin_insert" ON public.app_settings
  FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "app_settings_admin_update" ON public.app_settings;
CREATE POLICY "app_settings_admin_update" ON public.app_settings
  FOR UPDATE TO authenticated USING (is_admin());


-- ============================================================================
-- LO QUE NO SE TOCA, Y POR QUÉ
--
-- · is_admin() y can_user_book() siguen con EXECUTE para `authenticated`.
--   El advisor los marca, pero revocarlo ROMPE la app: si una política RLS
--   llama a una función sobre la que el rol no tiene EXECUTE, la consulta
--   falla entera con «42501: permission denied for function». Comprobado
--   contra esta misma BD. Es inherente al patrón RLS de Supabase.
--
-- · pg_net en el schema `public`: ya se decidió en 20260821_fix_minor_findings
--   que no se toca (la extensión no es relocalizable) y además la usan los
--   cron de recordatorios vía net.http_post.
--
-- · keepalive_ping con RLS y sin políticas: es deliberado. Solo service_role
--   la toca, desde supabase-keepalive.yml.
--
-- · La protección contra contraseñas filtradas (HaveIBeenPwned) no se puede
--   activar por SQL: es un ajuste del dashboard, en Authentication > Policies.
-- ============================================================================
