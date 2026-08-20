-- CRÍTICO 3 de la auditoría pre-producción: el límite de clases/mes y el
-- bloqueo por cuota impagada (src/utils/planEnforcement.ts) solo se
-- aplicaban en el cliente. Un usuario podía saltárselo llamando a la API
-- directamente. Se replica la misma lógica (misma que planPayments.ts:
-- periodo anclado al calendario, gracia hasta el día 5) en una función
-- SECURITY DEFINER usada en el WITH CHECK de la política INSERT.
--
-- El pre-booking manual del admin (política "Admins can create any booking",
-- WITH CHECK is_admin()) NO se toca: sigue exento, como se decidió al
-- construir la feature — es una vía de override intencionada para el staff.

CREATE OR REPLACE FUNCTION public.can_user_book(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
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
BEGIN
  SELECT plan_id INTO v_plan_id FROM public.profiles WHERE id = p_user_id;
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

    IF NOT v_paid AND CURRENT_DATE >= (v_period_start + 4) THEN
      RETURN false;
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

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.can_user_book(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_user_book(uuid) TO authenticated;

-- Las dos políticas de autoservicio eran duplicadas (mismo efecto, nombre
-- en inglés y en español) — se consolidan en una sola que además exige
-- can_user_book(). Si se dejara la duplicada sin tocar, al ser PERMISSIVE
-- seguiría permitiendo el insert sin más condición y el fix no serviría.
DROP POLICY IF EXISTS "Users can create own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Usuarios pueden crear sus propias reservas" ON public.bookings;

CREATE POLICY "Users can create own bookings" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_user_book(user_id));
