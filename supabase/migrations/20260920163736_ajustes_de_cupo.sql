-- ============================================================================
-- AJUSTES DE CUPO
--
-- El admin necesita corregir las clases consumidas de un socio sin que haya
-- una reserva detrás: vino y no se apuntó, se apuntó y no se borró, o se le
-- vende un plan mensual a mitad de mes y solo le tocan la mitad de clases.
--
-- Se guarda como ajuste y no tocando el contador, porque un contador no
-- explica por qué cambió. Aquí queda quién lo hizo, cuándo y con qué motivo,
-- que es lo que hace falta el día que un socio reclame.
--
-- `used_delta` suma a las clases CONSUMIDAS:
--     +1  le quita una clase del bono (vino sin apuntarse)
--     -1  se la devuelve (la clase se canceló, error al restar)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.plan_adjustments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Ata el ajuste a una ventana de cupo concreta, para que no se arrastre al
  -- mes siguiente ni al bono siguiente.
  period_start date NOT NULL,
  used_delta   int  NOT NULL CHECK (used_delta <> 0),
  reason       text NOT NULL CHECK (length(btrim(reason)) > 0),
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_adjustments_user_period
  ON public.plan_adjustments (user_id, period_start);
CREATE INDEX IF NOT EXISTS idx_plan_adjustments_created_by
  ON public.plan_adjustments (created_by);

ALTER TABLE public.plan_adjustments ENABLE ROW LEVEL SECURITY;

-- El socio ve los suyos: si su contador baja sin haber reservado, tiene
-- derecho a saber por qué y quién lo hizo.
DROP POLICY IF EXISTS "adjustments_select_own" ON public.plan_adjustments;
CREATE POLICY "adjustments_select_own" ON public.plan_adjustments
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "adjustments_admin_all" ON public.plan_adjustments;
CREATE POLICY "adjustments_admin_all" ON public.plan_adjustments
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ----------------------------------------------------------------------------
-- Inicio de la ventana de cupo vigente de un socio.
--
-- Existe para que el ajuste se guarde contra exactamente la misma ventana que
-- luego mira can_user_book. Si cada uno la calculase por su cuenta, acabarían
-- discrepando y el ajuste se perdería.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quota_period_start(p_user_id uuid)
RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_plan_id uuid; v_billing text; v_assigned date;
BEGIN
  SELECT p.plan_id, p.plan_assigned_at::date, mp.billing_period
    INTO v_plan_id, v_assigned, v_billing
    FROM public.profiles p LEFT JOIN public.membership_plans mp ON mp.id = p.plan_id
    WHERE p.id = p_user_id;

  IF v_plan_id IS NULL THEN RETURN NULL; END IF;
  IF v_billing = 'once' THEN RETURN v_assigned; END IF;

  RETURN date_trunc(
    CASE v_billing WHEN 'yearly' THEN 'year' WHEN 'quarterly' THEN 'quarter' ELSE 'month' END,
    now()
  )::date;
END $$;

GRANT EXECUTE ON FUNCTION public.quota_period_start(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- can_user_book pasa a contar los ajustes.
--
-- Único cambio respecto a la versión anterior: tras contar las reservas de la
-- ventana, se le suma el delta de los ajustes de esa misma ventana. Sin esto
-- el ajuste sería decorativo: se vería en el panel pero el socio seguiría
-- pudiendo reservar.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_user_book(p_user_id uuid, p_class_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_id uuid; v_is_active boolean; v_billing_period text;
  v_classes_per_month int; v_validity_days int; v_plan_assigned_at date;
  v_period_start date; v_period_months int; v_period_end date;
  v_paid boolean; v_count int; v_class_datetime timestamptz; v_cutoff_hours int;
  v_created_at_date date; v_prev_period_start date; v_prev_paid boolean;
  v_trial_used timestamptz; v_trial_enabled text; v_is_trial boolean := false;
  v_adjust int;
BEGIN
  SELECT plan_id, created_at::date, plan_assigned_at::date, free_trial_used_at
    INTO v_plan_id, v_created_at_date, v_plan_assigned_at, v_trial_used
    FROM public.profiles WHERE id = p_user_id;
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
      v_period_end := v_plan_assigned_at + (v_validity_days || ' days')::interval;
      IF now() >= v_period_end THEN RETURN false; END IF;
      IF v_classes_per_month IS NOT NULL THEN
        SELECT count(*) INTO v_count FROM public.bookings b JOIN public.classes c ON c.id = b.class_id
          WHERE b.user_id = p_user_id AND c.class_date >= v_period_start AND c.class_date < v_period_end;
        SELECT COALESCE(sum(used_delta), 0) INTO v_adjust FROM public.plan_adjustments
          WHERE user_id = p_user_id AND period_start = v_period_start;
        IF (v_count + v_adjust) >= v_classes_per_month THEN RETURN false; END IF;
      END IF;
    ELSE
      v_period_months := CASE v_billing_period WHEN 'yearly' THEN 12 WHEN 'quarterly' THEN 3 ELSE 1 END;
      v_period_start := date_trunc(CASE v_billing_period WHEN 'yearly' THEN 'year' WHEN 'quarterly' THEN 'quarter' ELSE 'month' END, now())::date;
      v_period_end := (v_period_start + (v_period_months || ' months')::interval)::date;
      IF v_billing_period <> 'daily' THEN
        SELECT EXISTS(SELECT 1 FROM public.plan_payments WHERE user_id = p_user_id AND period_start = v_period_start) INTO v_paid;
        IF NOT v_paid THEN
          IF CURRENT_DATE >= (v_period_start + 4) THEN RETURN false; END IF;
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
          WHERE b.user_id = p_user_id AND c.class_date >= v_period_start AND c.class_date < v_period_end;
        SELECT COALESCE(sum(used_delta), 0) INTO v_adjust FROM public.plan_adjustments
          WHERE user_id = p_user_id AND period_start = v_period_start;
        IF (v_count + v_adjust) >= (v_classes_per_month * v_period_months) THEN RETURN false; END IF;
      END IF;
    END IF;
  END IF;

  SELECT (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid' INTO v_class_datetime
    FROM public.classes c WHERE c.id = p_class_id;
  IF v_class_datetime IS NOT NULL THEN
    SELECT COALESCE(value::int, 48) INTO v_cutoff_hours FROM public.app_settings WHERE key = 'booking_cutoff_hours';
    IF now() < v_class_datetime - (COALESCE(v_cutoff_hours, 48) || ' hours')::interval THEN RETURN false; END IF;
  END IF;

  RETURN true;
END;
$function$;
