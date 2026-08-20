-- Descubierto durante la auditoría pre-producción: el cron semanal de
-- plantillas de reserva apuntaba a '/functions/v1/apply-weekly-templates',
-- una función que no existe con ese nombre — la función real desplegada es
-- 'smart-action' (mismo código, renombrado en algún punto sin actualizar el
-- cron). Llevaba tiempo fallando en silencio cada domingo (404), así que las
-- reservas automáticas por plantilla semanal no se estaban aplicando.
-- Se corrige la URL y se añade x-cron-secret, que smart-action exige desde
-- el endurecimiento de seguridad de esta misma sesión.
--
-- El valor real de x-cron-secret NO se guarda en este fichero (viviría en
-- texto plano en el historial de git para siempre) — se sustituye a mano por
-- el valor real de CRON_SECRET antes de aplicar la migración.
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'apply-weekly-templates'),
  command := $$
  SELECT
    net.http_post(
      url := 'https://llkcidbbadjgrrquexqd.supabase.co/functions/v1/smart-action',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SUPABASE_ANON_KEY>',
        'x-cron-secret', '<CRON_SECRET>'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
