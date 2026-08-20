-- El formulario de planes ofrece "Trimestral" (quarterly) pero la constraint
-- solo permitía daily/monthly/yearly, así que guardar un plan trimestral
-- fallaba con un 23514 (check constraint violation).
ALTER TABLE membership_plans DROP CONSTRAINT membership_plans_billing_period_check;
ALTER TABLE membership_plans ADD CONSTRAINT membership_plans_billing_period_check
  CHECK (billing_period = ANY (ARRAY['daily'::text, 'monthly'::text, 'quarterly'::text, 'yearly'::text]));
