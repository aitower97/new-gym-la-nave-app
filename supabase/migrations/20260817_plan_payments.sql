-- Registro manual de pagos de cuota. Los periodos están anclados al calendario
-- (día 1 del mes/trimestre/año según billing_period del plan), no a la fecha
-- de alta del usuario. period_start es siempre el día 1 del periodo que cubre.
CREATE TABLE public.plan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  marked_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_start)
);

ALTER TABLE public.plan_payments ENABLE ROW LEVEL SECURITY;

-- El propio usuario puede ver su historial de pagos.
CREATE POLICY "plan_payments_select_own" ON public.plan_payments
  FOR SELECT USING (auth.uid() = user_id);

-- Los admins pueden ver y gestionar los pagos de cualquier usuario.
CREATE POLICY "plan_payments_admin_select" ON public.plan_payments
  FOR SELECT USING (public.is_admin());

CREATE POLICY "plan_payments_admin_insert" ON public.plan_payments
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY "plan_payments_admin_update" ON public.plan_payments
  FOR UPDATE USING (public.is_admin());

CREATE POLICY "plan_payments_admin_delete" ON public.plan_payments
  FOR DELETE USING (public.is_admin());
