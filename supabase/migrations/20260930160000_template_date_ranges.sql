-- Plantillas con fechas: un socio puede tener varias (una semana suelta, un
-- cambio a partir de una fecha...). Cada plantilla son las filas con el mismo
-- (valid_from, valid_until); sin fechas = "Siempre", como hasta ahora.
-- Para cada día manda la que empieza más tarde de las que lo cubren (ver
-- src/utils/templatePeriods.ts y supabase/functions/smart-action).
--
-- Columnas opcionales: las filas existentes quedan como "Siempre" y las apps
-- antiguas siguen funcionando igual.

ALTER TABLE public.booking_templates
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_until date;

ALTER TABLE public.booking_templates
  DROP CONSTRAINT IF EXISTS booking_templates_valid_range;
ALTER TABLE public.booking_templates
  ADD CONSTRAINT booking_templates_valid_range
  CHECK (valid_from IS NULL OR valid_until IS NULL OR valid_from <= valid_until);
