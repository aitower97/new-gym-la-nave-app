-- can_user_book necesita el mismo cambio que src/utils/planEnforcement.ts:
-- los bonos (billing_period 'once') no tienen periodo de facturación por
-- calendario ni cuota periódica — su ventana de cupo va de
-- profiles.plan_assigned_at a esa fecha + membership_plans.validity_days, y
-- pasada esa fecha el bono caduca (se bloquea la reserva, no solo el cupo).
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
  v_validity_days int;
  v_plan_assigned_at date;
  v_period_start date;
  v_period_months int;
  v_period_end date;
  v_paid boolean;
  v_count int;
  v_class_datetime timestamptz;
  v_cutoff_hours int;
  v_created_at_date date;
  v_prev_period_start date;
  v_prev_paid boolean;
BEGIN
  SELECT plan_id, created_at::date, plan_assigned_at::date
    INTO v_plan_id, v_created_at_date, v_plan_assigned_at
    FROM public.profiles WHERE id = p_user_id;
  IF v_plan_id IS NULL THEN RETURN false; END IF;

  SELECT is_active, billing_period, classes_per_month, validity_days
    INTO v_is_active, v_billing_period, v_classes_per_month, v_validity_days
    FROM public.membership_plans WHERE id = v_plan_id;

  IF NOT FOUND OR NOT v_is_active THEN RETURN false; END IF;

  IF v_billing_period = 'once' THEN
    -- Bono: sin cuota periódica, ventana de vigencia anclada a cuándo se le
    -- asignó al socio, no al calendario.
    IF v_plan_assigned_at IS NULL OR v_validity_days IS NULL THEN RETURN false; END IF;
    v_period_start := v_plan_assigned_at;
    v_period_end := v_plan_assigned_at + (v_validity_days || ' days')::interval;
    IF now() >= v_period_end THEN RETURN false; END IF; -- bono caducado

    IF v_classes_per_month IS NOT NULL THEN
      SELECT count(*) INTO v_count
        FROM public.bookings b
        JOIN public.classes c ON c.id = b.class_id
        WHERE b.user_id = p_user_id
          AND c.class_date >= v_period_start
          AND c.class_date < v_period_end;

      IF v_count >= v_classes_per_month THEN RETURN false; END IF;
    END IF;
  ELSE
    -- Periodo de facturación anclado al calendario (día 1 del mes/trimestre/año).
    -- 'daily' no tiene periodo propio — se trata como mensual para el cupo,
    -- igual que getCurrentPeriodStart en el cliente.
    v_period_months := CASE v_billing_period WHEN 'yearly' THEN 12 WHEN 'quarterly' THEN 3 ELSE 1 END;
    v_period_start := date_trunc(
      CASE v_billing_period WHEN 'yearly' THEN 'year' WHEN 'quarterly' THEN 'quarter' ELSE 'month' END,
      now()
    )::date;
    v_period_end := (v_period_start + (v_period_months || ' months')::interval)::date;

    -- Cuota impagada tras el día 5 del periodo (planes 'daily' no tienen cuota periódica).
    IF v_billing_period <> 'daily' THEN
      SELECT EXISTS(
        SELECT 1 FROM public.plan_payments
        WHERE user_id = p_user_id AND period_start = v_period_start
      ) INTO v_paid;

      IF NOT v_paid THEN
        IF CURRENT_DATE >= (v_period_start + 4) THEN
          RETURN false;
        END IF;

        -- Arrastre de mora: si ya era socio en el periodo anterior y ese
        -- periodo tampoco se pagó, no hay margen de gracia este periodo.
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

    -- Límite de clases del periodo de facturación del plan. classes_per_month
    -- sigue siendo la tasa mensual: el cupo total del periodo es esa tasa ×
    -- los meses que dura el periodo (mensual ×1, trimestral ×3, anual ×12).
    IF v_classes_per_month IS NOT NULL THEN
      SELECT count(*) INTO v_count
        FROM public.bookings b
        JOIN public.classes c ON c.id = b.class_id
        WHERE b.user_id = p_user_id
          AND c.class_date >= v_period_start
          AND c.class_date < v_period_end;

      IF v_count >= (v_classes_per_month * v_period_months) THEN RETURN false; END IF;
    END IF;
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
