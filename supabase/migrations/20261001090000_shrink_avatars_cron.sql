-- Cron que reduce las fotos de perfil grandes a 256×256 JPEG (función
-- shrink-avatars), en el mismo sitio y con la misma URL.
--
-- Por qué: los avatares se subían a tamaño de cámara y la lista de apuntados
-- los descargaba una y otra vez: ~850 MB/día de "cached egress" frente a los
-- 5,5 GB/mes del plan gratuito (aviso de Supabase del 1 oct 2026). Las 72
-- fotos que había se redujeron a mano ese día (29,3 MB → 1 MB).
--
-- Una petición por foto: cada una cabe de sobra en la CPU de una Edge
-- Function. Solo fotos tocadas en el último día, para que una que no se pueda
-- convertir no se reintente para siempre.
--
-- Ya aplicado en producción. Las cabeceras reales (anon key + x-cron-secret)
-- se copiaron del cron payment-reminders-daily; NO se guardan aquí.

SELECT cron.schedule('shrink-avatars-hourly', '15 * * * *', $cmd$
  SELECT net.http_post(
    url := 'https://llkcidbbadjgrrquexqd.supabase.co/functions/v1/shrink-avatars',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <ANON_KEY>", "x-cron-secret": "<CRON_SECRET>"}'::jsonb,
    body := jsonb_build_object('path', o.name),
    timeout_milliseconds := 60000
  )
  FROM storage.objects o
  WHERE o.bucket_id = 'avatars'
    AND (o.metadata->>'size')::int > 60000
    AND o.updated_at > now() - interval '1 day';
$cmd$);
