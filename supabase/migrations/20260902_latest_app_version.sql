-- Última versión publicada en las tiendas. Si la versión instalada del
-- usuario es menor, la app le bloquea el acceso por completo hasta que
-- actualice (ver src/components/UpdateAvailableModal.tsx). Es cosa del
-- developer, no del admin del gimnasio — no hay pantalla en el panel para
-- esto, se actualiza directamente en la base de datos justo después de
-- publicar una nueva versión en Google Play (en iOS no hace falta: se
-- comprueba solo contra la API pública de Apple).
INSERT INTO public.app_settings (key, value) VALUES ('latest_app_version', '0.0.0')
ON CONFLICT (key) DO NOTHING;
