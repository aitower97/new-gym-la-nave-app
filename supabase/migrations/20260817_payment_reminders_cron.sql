-- Ejecuta la Edge Function payment-reminders todos los días a las 09:00 UTC.
-- Revisa el estado de pago de cada usuario y dispara notificación in-app +
-- push + email (si hay proveedor configurado) en el día 1 (recordatorio) y
-- en el día 5 (bloqueo) de cada periodo de facturación.
SELECT cron.schedule(
  'payment-reminders-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://llkcidbbadjgrrquexqd.supabase.co/functions/v1/payment-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxsa2NpZGJiYWRqZ3JycXVleHFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODg0NjEsImV4cCI6MjA5MDQ2NDQ2MX0.0NEOYVSFZs-54AJ2nna-GyWaHVLVymQkHNvd6JxmQzw'
    ),
    body := '{}'::jsonb
  );
  $$
);
