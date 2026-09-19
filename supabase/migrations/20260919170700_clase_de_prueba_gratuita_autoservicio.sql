-- Clase de prueba gratuita en autoservicio: quien se registra puede reservar
-- UNA clase sin que el admin le asigne nada. Antes can_user_book cortaba en
-- seco con `IF v_plan_id IS NULL THEN RETURN false`.
--
-- Hace falta una columna y no basta con contar reservas: al cancelar, la
-- reserva se BORRA, así que contar sería puenteable reservando y cancelando.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS free_trial_used_at timestamptz;

COMMENT ON COLUMN public.profiles.free_trial_used_at IS
  'Cuándo gastó su clase de prueba gratuita un socio sin plan. NULL = aún la tiene.';

-- Interruptor del admin, en app_settings como booking_cutoff_hours: se apaga
-- sin desplegar nada.
INSERT INTO public.app_settings (key, value) VALUES ('free_trial_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

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
BEGIN
  SELECT plan_id, created_at::date, plan_assigned_at::date, free_trial_used_at
    INTO v_plan_id, v_created_at_date, v_plan_assigned_at, v_trial_used
    FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Sin plan: se permite la clase de prueba si está activa y no la ha gastado.
  -- El corte de horas sigue aplicando igual que a todo el mundo (más abajo).
  IF v_plan_id IS NULL THEN
    SELECT value INTO v_trial_enabled FROM public.app_settings WHERE key = 'free_trial_enabled';
    IF COALESCE(v_trial_enabled, 'false') <> 'true' THEN RETURN false; END IF;
    IF v_trial_used IS NOT NULL THEN RETURN false; END IF;
    v_is_trial := true;
  END IF;

  -- Todo este bloque es el de siempre, sin un solo cambio: solo se salta
  -- cuando se trata de la prueba gratuita, que no tiene plan que validar.
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
        IF v_count >= v_classes_per_month THEN RETURN false; END IF;
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
        IF v_count >= (v_classes_per_month * v_period_months) THEN RETURN false; END IF;
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

-- Marcar la prueba al reservar. Va en un trigger y no en la política RLS
-- porque can_user_book es STABLE: no puede escribir.
CREATE OR REPLACE FUNCTION public.mark_free_trial_used() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.profiles SET free_trial_used_at = now()
  WHERE id = NEW.user_id AND plan_id IS NULL AND free_trial_used_at IS NULL;
  RETURN NEW;
END $$;

-- Devolverla si cancela a tiempo. Solo si la clase aún no ha ocurrido: borrar
-- una reserva ya pasada no puede regalar otra prueba.
CREATE OR REPLACE FUNCTION public.release_free_trial() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_when timestamptz;
BEGIN
  SELECT (c.class_date + c.class_time) AT TIME ZONE 'Europe/Madrid' INTO v_when
    FROM public.classes c WHERE c.id = OLD.class_id;
  IF v_when IS NOT NULL AND v_when > now() THEN
    UPDATE public.profiles SET free_trial_used_at = NULL
    WHERE id = OLD.user_id AND plan_id IS NULL;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_mark_free_trial_used ON public.bookings;
CREATE TRIGGER trg_mark_free_trial_used AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.mark_free_trial_used();

DROP TRIGGER IF EXISTS trg_release_free_trial ON public.bookings;
CREATE TRIGGER trg_release_free_trial AFTER DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.release_free_trial();

-- Son funciones de trigger: no pintan nada en /rest/v1/rpc/.
REVOKE EXECUTE ON FUNCTION public.mark_free_trial_used() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_free_trial()  FROM PUBLIC, anon, authenticated;
