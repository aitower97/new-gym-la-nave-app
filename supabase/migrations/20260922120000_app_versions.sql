-- Versión mínima y última publicada por plataforma, para el bloqueo de
-- actualización obligatoria (ver src/components/UpdateAvailableModal.tsx).
--
-- Sustituye al par app_settings.latest_app_version (Android) + API pública
-- de Apple (iOS): con eso el bloqueo era siempre "¿estás en la última?", sin
-- margen. Con minimum_version separado de latest_version, un usuario puede
-- quedarse unas versiones por detrás sin que la app le corte el acceso,
-- hasta que el developer suba minimum_version tras un cambio que sí lo
-- requiera (p. ej. rotura de compatibilidad con el backend).
--
-- Es cosa del developer, no del admin del gimnasio — no hay pantalla en el
-- panel para esto, se actualiza a mano (o por script) tras publicar.
CREATE TABLE public.app_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL UNIQUE CHECK (platform IN ('ios', 'android')),
  minimum_version text NOT NULL CHECK (minimum_version ~ '^\d+\.\d+\.\d+$'),
  latest_version text NOT NULL CHECK (latest_version ~ '^\d+\.\d+\.\d+$'),
  store_url text NOT NULL CHECK (store_url <> ''),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- '0.0.0' == no forzar nada todavía, igual que arrancaba
-- app_settings.latest_app_version. Las URLs son las reales que ya usa
-- src/utils/appVersion.ts (es.lanave.app / id6768556827), no placeholders.
INSERT INTO public.app_versions (platform, minimum_version, latest_version, store_url) VALUES
  ('ios', '0.0.0', '0.0.0', 'https://apps.apple.com/app/id6768556827'),
  ('android', '0.0.0', '0.0.0', 'https://play.google.com/store/apps/details?id=es.lanave.app');

ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

-- Legible por cualquiera (anon incluido: el chequeo corre al arrancar la
-- app, sin depender de que el usuario esté logueado), editable solo por
-- admins — igual que app_settings.
CREATE POLICY "app_versions_select_all" ON public.app_versions
  FOR SELECT USING (true);

CREATE POLICY "app_versions_admin_insert" ON public.app_versions
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "app_versions_admin_update" ON public.app_versions
  FOR UPDATE USING (public.is_admin());
