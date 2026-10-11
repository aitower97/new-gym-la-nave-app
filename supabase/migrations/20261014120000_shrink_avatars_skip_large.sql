-- shrink-avatars guarda ahora también una versión de 720 px (<nombre>-lg.jpg)
-- para el visor a pantalla completa. Pesa más de 60 KB: el cron no debe
-- volver a reducirla (la función también la rechaza, por si acaso).
--
-- Se edita el comando del cron en su sitio con replace(): así las cabeceras
-- con los secretos no pasan por este fichero. Ya aplicado en producción.

SELECT cron.alter_job(
  jobid,
  command := replace(command,
    $a$AND o.updated_at > now() - interval '1 day'$a$,
    $b$AND o.updated_at > now() - interval '1 day'
    AND o.name NOT LIKE '%-lg.jpg'$b$)
)
FROM cron.job
WHERE jobname = 'shrink-avatars-hourly'
  AND command NOT LIKE '%-lg.jpg%';
