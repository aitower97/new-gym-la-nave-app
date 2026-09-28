-- Las reglas automáticas (cumpleaños, inactividad, cupo…) tampoco se envían
-- a cuentas demo: en las 9 reglas, junto al filtro de admins.
DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.run_notification_rules'::regproc);
  v_def := replace(v_def, 'r.role = ''admin'')', 'r.role = ''admin'') AND NOT p.is_demo');
  EXECUTE v_def;
END $$;
