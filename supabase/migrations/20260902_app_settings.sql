-- Configuración global editable por el admin (clave/valor). Primer uso:
-- cuántas horas de antelación mínima hace falta para poder reservar una
-- clase (antes de eso la clase aparece bloqueada con cuenta atrás en la
-- vista de usuario). Legible por cualquiera (hace falta para calcular el
-- bloqueo en la pantalla de reservas), editable solo por admins.
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

INSERT INTO public.app_settings (key, value) VALUES ('booking_cutoff_hours', '48');

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_select_all" ON public.app_settings
  FOR SELECT USING (true);

CREATE POLICY "app_settings_admin_insert" ON public.app_settings
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "app_settings_admin_update" ON public.app_settings
  FOR UPDATE USING (public.is_admin());
