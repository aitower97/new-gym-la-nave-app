-- Panel de admin para gestionar notificaciones (ver
-- src/screens/AdminNotificationsScreen.tsx). Centraliza las 3 notificaciones
-- automáticas de texto fijo que hoy viven hardcodeadas en dos sitios
-- distintos (payment_due/payment_blocked en la edge function
-- payment-reminders, inactivity_nudge en notify_inactive_members) más las
-- plantillas custom que cree el admin para envío manual.
--
-- 'inactivity' admite varias filas (distintos offset_days: 15, 30...) — el
-- admin puede crear más sin depender de un developer. 'payment_due' y
-- 'payment_blocked' son singleton (key única): esa lógica está acoplada al
-- ciclo de facturación real (getCurrentPeriodStart, plan_payments,
-- isGraceExpired) y no se generaliza aquí.
CREATE TABLE public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE,
  trigger_kind text NOT NULL CHECK (trigger_kind IN ('manual', 'inactivity', 'payment_due', 'payment_blocked')),
  -- días sin asistir ('inactivity') o día del periodo en que se bloquean
  -- reservas ('payment_blocked' — mismo valor que usa isGraceExpired, ver
  -- src/utils/planPayments.ts:getPaymentBlockGraceDays). NULL en el resto.
  offset_days int,
  enabled boolean NOT NULL DEFAULT true,
  title text NOT NULL,
  message text NOT NULL,
  created_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (trigger_kind NOT IN ('inactivity', 'payment_blocked') OR offset_days IS NOT NULL)
);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_templates_select_all" ON public.notification_templates
  FOR SELECT USING (true);

CREATE POLICY "notification_templates_admin_insert" ON public.notification_templates
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "notification_templates_admin_update" ON public.notification_templates
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "notification_templates_admin_delete" ON public.notification_templates
  FOR DELETE USING (public.is_admin());

-- Para el anti-duplicado por regla en notify_inactive_members(): con varias
-- reglas 'inactivity' posibles, el dedup ya no puede ser "por type y
-- ventana de tiempo global", tiene que ser por regla concreta.
ALTER TABLE public.notifications ADD COLUMN template_id uuid REFERENCES public.notification_templates(id);

-- Precarga con el contenido y los umbrales que ya estaban en uso, para no
-- cambiar comportamiento el día del deploy.
INSERT INTO public.notification_templates (key, trigger_kind, offset_days, enabled, title, message) VALUES
  ('payment_due', 'payment_due', NULL, true, 'Cuota pendiente',
   'Tu cuota de "{{plan}}" de este periodo aún no está registrada. Tienes hasta el día 5 para renovarla antes de perder acceso a las reservas.'),
  ('payment_blocked', 'payment_blocked', 5, true, 'Reservas bloqueadas',
   'No se ha registrado el pago de tu cuota de "{{plan}}" y ya no puedes reservar clases. Ponte al día con tu entrenador.');

INSERT INTO public.notification_templates (trigger_kind, offset_days, enabled, title, message)
SELECT 'inactivity',
       COALESCE((SELECT value::int FROM public.app_settings WHERE key = 'inactivity_days'), 15),
       COALESCE((SELECT value FROM public.app_settings WHERE key = 'inactivity_enabled'), 'true') = 'true',
       'Te echamos de menos',
       'Ánimo, compañero: llevamos mucho tiempo sin verte por La Nave. ¡Te esperamos!';

-- ----------------------------------------------------------------------------
-- notify_inactive_members(): generalizada para iterar TODAS las reglas
-- 'inactivity' activas en vez de un único umbral fijo. Misma condición de
-- elegibilidad de siempre, dedup ahora por template_id (no por ventana
-- global), para que un socio pueda recibir el aviso de 15 días y, más
-- adelante, uno de 30, sin pisarse entre sí.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_inactive_members()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_regla record; v_socio record; v_tokens text[]; v_n int := 0;
BEGIN
  FOR v_regla IN
    SELECT id, offset_days, title, message
    FROM public.notification_templates
    WHERE trigger_kind = 'inactivity' AND enabled
  LOOP
    FOR v_socio IN
      SELECT p.id
      FROM public.profiles p
      JOIN public.membership_plans mp ON mp.id = p.plan_id
      WHERE mp.is_active
        -- El admin no necesita que le animen a venir.
        AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin')
        AND COALESCE(
              public.last_attendance(p.id),
              p.plan_assigned_at,
              p.created_at
            ) < now() - (v_regla.offset_days || ' days')::interval
        AND NOT EXISTS (
          SELECT 1 FROM public.notifications n
          WHERE n.user_id = p.id
            AND n.template_id = v_regla.id
            AND n.created_at > now() - (v_regla.offset_days || ' days')::interval
        )
    LOOP
      INSERT INTO public.notifications (user_id, type, title, message, template_id)
      VALUES (v_socio.id, 'inactivity_nudge', v_regla.title, v_regla.message, v_regla.id);

      SELECT array_agg(token) INTO v_tokens
        FROM public.push_tokens WHERE user_id = v_socio.id;

      IF v_tokens IS NOT NULL THEN
        PERFORM net.http_post(
          url     := 'https://exp.host/--/api/v2/push/send',
          headers := jsonb_build_object('Content-Type', 'application/json'),
          body    := (SELECT jsonb_agg(jsonb_build_object(
                        'to', t, 'sound', 'default', 'title', v_regla.title, 'body', v_regla.message))
                      FROM unnest(v_tokens) AS t)
        );
      END IF;

      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  RETURN v_n;
END $$;

REVOKE EXECUTE ON FUNCTION public.notify_inactive_members() FROM PUBLIC, anon, authenticated;
