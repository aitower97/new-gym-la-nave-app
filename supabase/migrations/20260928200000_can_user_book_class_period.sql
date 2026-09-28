-- can_user_book: auditoría de fechas (28/09/2026).
--
-- 1) El cupo se contaba en el periodo de HOY, no en el de la CLASE: en fin
--    de mes (con 48 h de antelación se reservan clases del mes siguiente) un
--    socio con el cupo de septiembre agotado no podía reservar el 1 de
--    octubre, y una clase de octubre se comparaba contra septiembre. Ahora el
--    periodo (y el pago que se exige) es el de la fecha de la clase.
-- 2) La base está en UTC: date_trunc(now()) y CURRENT_DATE daban el mes o el
--    día anterior entre las 00:00 y las 02:00 de España. Ahora "hoy" es la
--    fecha de Madrid.
-- 3) Los días de gracia del pago iban fijos (bloqueo el día 5). Ahora se
--    leen del mismo sitio que la app y el aviso automático
--    (notification_templates 'payment_blocked'.offset_days, 5 por defecto).
-- 4) Bono: la clase tiene que caer dentro de su vigencia, no basta con que
--    el bono siga vigente el día que se reserva.
--
-- El resto (prueba gratuita, máximo por día, antelación) queda igual.

CREATE OR REPLACE FUNCTION public.can_user_book(p_user_id uuid, p_class_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_id uuid; v_is_active boolean; v_billing_period text;
  v_classes_per_month int; v_validity_days int; v_plan_assigned_at date;
  v_period_start date; v_period_months int; v_period_end date;
  v_paid boolean; v_count int; v_class_datetime timestamptz; v_cutoff_hours int;
  v_created_at_date date; v_prev_period_start date; v_prev_paid boolean;
  v_trial_used timestamptz; v_trial_enabled text; v_is_trial boolean := false;
  v_adjust int; v_class_date date; v_same_day int;
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_grace int;
BEGIN
  -- plan_assigned_at::date en UTC a propósito: es la clave de la ventana del
  -- bono y de plan_adjustments en quota_period_start y en la app
  -- (src/utils/bonoWindow.ts). Cambiarlo aquí descuadraría los ajustes.
  SELECT plan_id, (created_at AT TIME ZONE 'Europe/Madrid')::date,
         plan_assigned_at::date, free_trial_used_at
    INTO v_plan_id, v_created_at_date, v_plan_assigned_at, v_trial_used
    FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid', c.class_date
    INTO v_class_datetime, v_class_date
    FROM public.classes c WHERE c.id = p_class_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_plan_id IS NULL THEN
    SELECT value INTO v_trial_enabled FROM public.app_settings WHERE key = 'free_trial_enabled';
    IF COALESCE(v_trial_enabled, 'false') <> 'true' THEN RETURN false; END IF;
    IF v_trial_used IS NOT NULL THEN RETURN false; END IF;
    v_is_trial := true;
  END IF;

  IF NOT v_is_trial THEN
    SELECT is_active, billing_period, classes_per_month, validity_days
      INTO v_is_active, v_billing_period, v_classes_per_month, v_validity_days
      FROM public.membership_plans WHERE id = v_plan_id;
    IF NOT FOUND OR NOT v_is_active THEN RETURN false; END IF;

    IF v_billing_period = 'once' THEN
      IF v_plan_assigned_at IS NULL OR v_validity_days IS NULL THEN RETURN false; END IF;
      v_period_start := v_plan_assigned_at;
      v_period_end := v_plan_assigned_at + v_validity_days;
      -- La clase tiene que caer dentro de la vigencia del bono
      IF v_class_date < v_period_start OR v_class_date >= v_period_end THEN RETURN false; END IF;
      IF v_classes_per_month IS NOT NULL THEN
        SELECT count(*) INTO v_count FROM public.bookings b JOIN public.classes c ON c.id = b.class_id
          WHERE b.user_id = p_user_id AND b.class_id <> p_class_id
            AND c.class_date >= v_period_start AND c.class_date < v_period_end;
        SELECT COALESCE(sum(used_delta), 0) INTO v_adjust FROM public.plan_adjustments
          WHERE user_id = p_user_id AND period_start = v_period_start;
        IF (v_count + v_adjust) >= v_classes_per_month THEN RETURN false; END IF;
      END IF;
    ELSE
      -- Periodo de la CLASE (no de hoy)
      v_period_months := CASE v_billing_period WHEN 'yearly' THEN 12 WHEN 'quarterly' THEN 3 ELSE 1 END;
      v_period_start := date_trunc(CASE v_billing_period WHEN 'yearly' THEN 'year' WHEN 'quarterly' THEN 'quarter' ELSE 'month' END, v_class_date)::date;
      v_period_end := (v_period_start + (v_period_months || ' months')::interval)::date;

      IF v_billing_period <> 'daily' THEN
        SELECT COALESCE(offset_days, 5) INTO v_grace FROM public.notification_templates WHERE key = 'payment_blocked';
        v_grace := COALESCE(v_grace, 5);

        SELECT EXISTS(SELECT 1 FROM public.plan_payments WHERE user_id = p_user_id AND period_start = v_period_start) INTO v_paid;
        IF NOT v_paid THEN
          -- Sin pagar el periodo de la clase: vale mientras dure la gracia
          -- (bloqueo desde el día v_grace del periodo)
          IF v_today >= v_period_start + (v_grace - 1) THEN RETURN false; END IF;
          -- ...y siempre que no arrastre el periodo anterior sin pagar
          v_prev_period_start := (CASE v_billing_period WHEN 'yearly' THEN v_period_start - interval '1 year'
            WHEN 'quarterly' THEN v_period_start - interval '3 months' ELSE v_period_start - interval '1 month' END)::date;
          IF v_created_at_date IS NOT NULL AND v_created_at_date <= v_prev_period_start THEN
            SELECT EXISTS(SELECT 1 FROM public.plan_payments WHERE user_id = p_user_id AND period_start = v_prev_period_start) INTO v_prev_paid;
            IF NOT v_prev_paid THEN RETURN false; END IF;
          END IF;
        END IF;
      END IF;

      IF v_classes_per_month IS NOT NULL THEN
        SELECT count(*) INTO v_count FROM public.bookings b JOIN public.classes c ON c.id = b.class_id
          WHERE b.user_id = p_user_id AND b.class_id <> p_class_id
            AND c.class_date >= v_period_start AND c.class_date < v_period_end;
        SELECT COALESCE(sum(used_delta), 0) INTO v_adjust FROM public.plan_adjustments
          WHERE user_id = p_user_id AND period_start = v_period_start;
        IF (v_count + v_adjust) >= (v_classes_per_month * v_period_months) THEN RETURN false; END IF;
      END IF;
    END IF;
  END IF;

  -- Máximo de clases por día (sin contar esta misma clase)
  SELECT count(*) INTO v_same_day FROM public.bookings b JOIN public.classes c ON c.id = b.class_id
    WHERE b.user_id = p_user_id AND b.class_id <> p_class_id AND c.class_date = v_class_date;
  IF v_same_day >= public.max_classes_per_day() THEN RETURN false; END IF;

  -- Ventana de antelación
  SELECT COALESCE(value::int, 48) INTO v_cutoff_hours FROM public.app_settings WHERE key = 'booking_cutoff_hours';
  IF now() < v_class_datetime - (COALESCE(v_cutoff_hours, 48) || ' hours')::interval THEN RETURN false; END IF;

  RETURN true;
END;
$function$;
