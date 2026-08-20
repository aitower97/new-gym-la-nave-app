-- Auditoría pre-producción — hallazgo MEDIO 1/2: payment-reminders (y
-- smart-action) solo estaban protegidas por el verify_jwt por defecto de la
-- plataforma, que acepta la anon key — pública, embebida en la app — como
-- JWT válido. Cualquiera podía disparar el envío de avisos a demanda. Ahora
-- la función además exige el header x-cron-secret (ver CRON_SECRET en los
-- secrets del proyecto), así que solo el cron real puede ejecutarla.
--
-- El valor real de x-cron-secret NO se guarda en este fichero (viviría en
-- texto plano en el historial de git para siempre) — se sustituye aquí a
-- mano por el valor real de CRON_SECRET (mismo que `supabase secrets set`)
-- antes de aplicar la migración, y no se commitea con el valor puesto.
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'payment-reminders-daily'),
  command := $$
  SELECT net.http_post(
    url := 'https://llkcidbbadjgrrquexqd.supabase.co/functions/v1/payment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SUPABASE_ANON_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
