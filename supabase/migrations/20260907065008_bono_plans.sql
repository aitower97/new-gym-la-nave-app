-- Bonos: el admin pidió un tipo de plan puntual (ej. "10 clases") cuyo
-- vencimiento no sigue un periodo de facturación por calendario (mensual/
-- trimestral/anual) sino una validez fija en días DESDE que se le asigna a
-- cada socio (a veces 15 días, otras 3 meses, según el bono). Se decidió
-- mantenerlo dentro de la misma tabla membership_plans (no una tabla nueva):
-- billing_period = 'once' marca un plan como bono, y validity_days guarda su
-- validez. classes_per_month se reutiliza también para bonos, pero ahí
-- representa el TOTAL de clases del bono (no una tasa mensual).
--
-- Para poder anclar la validez de un bono a "cuándo se le asignó a este
-- socio", profiles necesita esa fecha — hasta ahora plan_id no llevaba
-- ninguna fecha de asignación asociada.
ALTER TABLE public.membership_plans
  DROP CONSTRAINT membership_plans_billing_period_check;

ALTER TABLE public.membership_plans
  ADD CONSTRAINT membership_plans_billing_period_check
    CHECK (billing_period = ANY (ARRAY['daily'::text, 'monthly'::text, 'quarterly'::text, 'yearly'::text, 'once'::text]));

ALTER TABLE public.membership_plans
  ADD COLUMN validity_days integer NULL
    CONSTRAINT membership_plans_validity_days_check CHECK (validity_days IS NULL OR validity_days > 0);

ALTER TABLE public.membership_plans
  ADD CONSTRAINT membership_plans_once_requires_validity
    CHECK (billing_period <> 'once' OR validity_days IS NOT NULL);

ALTER TABLE public.profiles
  ADD COLUMN plan_assigned_at timestamptz NULL;

-- Backfill best-effort para los socios que ya tenían plan asignado antes de
-- esta migración: no sabemos la fecha real de asignación, así que se usa la
-- fecha de alta como aproximación razonable. Con los planes recurrentes
-- actuales (todos con billing_period distinto de 'once') este valor no se
-- llega a usar en el cálculo de cupo — solo importaría si alguno de estos
-- socios pasara a tener un bono, momento en el que el admin re-asigna el
-- plan de todas formas y esta fecha se sobrescribe con la real.
UPDATE public.profiles SET plan_assigned_at = created_at WHERE plan_id IS NOT NULL AND plan_assigned_at IS NULL;
