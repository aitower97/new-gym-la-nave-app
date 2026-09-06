-- La antelación mínima de reserva (app_settings.booking_cutoff_hours) solo
-- se comprobaba en el cliente (src/utils/planEnforcement.ts) — un usuario
-- podía saltársela insertando directamente en `bookings` con su propio JWT,
-- ya que can_user_book(uuid) nunca miraba la fecha/hora de la clase. Se
-- añade aquí como control real, del lado del servidor; el cliente sigue
-- haciendo su propia comprobación para el feedback inmediato (candado +
-- cuenta atrás), pero deja de ser la única barrera.
--
-- can_user_book(uuid) solo se usaba desde la política de INSERT de
-- `bookings` (verificado: ninguna otra función/política lo referencia), así
-- que se sustituye por una versión de dos parámetros sin dejar la firma
-- antigua colgando.

DROP POLICY IF EXISTS "Users can create own bookings" ON public.bookings;
DROP FUNCTION IF EXISTS public.can_user_book(uuid);

CREATE OR REPLACE FUNCTION public.can_user_book(p_user_id uuid, p_class_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_id uuid;
  v_is_active boolean;
  v_billing_period text;
  v_classes_per_month int;
  v_period_start date;
  v_paid boolean;
  v_month_start date;
  v_month_end date;
  v_count int;
  v_class_datetime timestamptz;
  v_cutoff_hours int;
  v_created_at_date date;
  v_prev_period_start date;
  v_prev_paid boolean;
BEGIN
  SELECT plan_id, created_at::date INTO v_plan_id, v_created_at_date FROM public.profiles WHERE id = p_user_id;
  IF v_plan_id IS NULL THEN RETURN false; END IF;

  SELECT is_active, billing_period, classes_per_month
    INTO v_is_active, v_billing_period, v_classes_per_month
    FROM public.membership_plans WHERE id = v_plan_id;

  IF NOT FOUND OR NOT v_is_active THEN RETURN false; END IF;

  -- Cuota impagada tras el día 5 del periodo (mensual/trimestral/anual
  -- anclado al calendario; los planes 'daily' no tienen cuota periódica).
  IF v_billing_period <> 'daily' THEN
    v_period_start := date_trunc(
      CASE v_billing_period WHEN 'yearly' THEN 'year'
           WHEN 'quarterly' THEN 'quarter' ELSE 'month' END,
      now()
    )::date;

    SELECT EXISTS(
      SELECT 1 FROM public.plan_payments
      WHERE user_id = p_user_id AND period_start = v_period_start
    ) INTO v_paid;

    IF NOT v_paid THEN
      IF CURRENT_DATE >= (v_period_start + 4) THEN
        RETURN false;
      END IF;

      -- Arrastre de mora (mismo criterio que src/utils/planPayments.ts): si
      -- ya era socio en el periodo anterior y ese periodo tampoco se pagó,
      -- no hay margen de gracia este periodo — se bloquea desde el día 1.
      v_prev_period_start := (
        CASE v_billing_period
          WHEN 'yearly' THEN v_period_start - interval '1 year'
          WHEN 'quarterly' THEN v_period_start - interval '3 months'
          ELSE v_period_start - interval '1 month'
        END
      )::date;

      IF v_created_at_date IS NOT NULL AND v_created_at_date <= v_prev_period_start THEN
        SELECT EXISTS(
          SELECT 1 FROM public.plan_payments
          WHERE user_id = p_user_id AND period_start = v_prev_period_start
        ) INTO v_prev_paid;

        IF NOT v_prev_paid THEN
          RETURN false;
        END IF;
      END IF;
    END IF;
  END IF;

  -- Límite de clases del mes en curso (siempre por mes natural, independiente
  -- de si la facturación del plan es mensual/trimestral/anual).
  IF v_classes_per_month IS NOT NULL THEN
    v_month_start := date_trunc('month', now())::date;
    v_month_end := (date_trunc('month', now()) + interval '1 month')::date;

    SELECT count(*) INTO v_count
      FROM public.bookings b
      JOIN public.classes c ON c.id = b.class_id
      WHERE b.user_id = p_user_id
        AND c.class_date >= v_month_start
        AND c.class_date < v_month_end;

    IF v_count >= v_classes_per_month THEN RETURN false; END IF;
  END IF;

  -- Antelación mínima de reserva. class_date/class_time se interpretan en
  -- hora de España (Europe/Madrid) — es la misma zona horaria que asume el
  -- cliente (dispositivos de socios/admin en España) al calcular el mismo
  -- corte con `new Date(...)`.
  SELECT (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid'
    INTO v_class_datetime
    FROM public.classes c WHERE c.id = p_class_id;

  IF v_class_datetime IS NOT NULL THEN
    SELECT COALESCE(value::int, 48) INTO v_cutoff_hours
      FROM public.app_settings WHERE key = 'booking_cutoff_hours';

    IF now() < v_class_datetime - (COALESCE(v_cutoff_hours, 48) || ' hours')::interval THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$function$;

CREATE POLICY "Users can create own bookings" ON public.bookings
  FOR INSERT
  WITH CHECK ((auth.uid() = user_id) AND can_user_book(user_id, class_id));
