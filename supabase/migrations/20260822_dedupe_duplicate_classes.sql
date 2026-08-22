-- Limpieza de clases duplicadas: se detectaron 77 filas duplicadas en
-- `classes` (mismo class_date + class_time + class_type repetido, casi
-- todas entre 2026-07-31 y 2026-08-21, más una serie semanal de martes
-- 19:00 CROSS TRAINING duplicada hasta 2026-12-29) — probablemente por
-- haber ejecutado dos veces la creación de clases recurrentes con rangos
-- solapados. Causaba franjas horarias duplicadas visibles tanto para
-- usuarios como para admin al reservar.
--
-- Por cada grupo duplicado se conserva la fila más antigua (created_at) y
-- se eliminan las demás. Las reservas de las filas eliminadas se mueven a
-- la fila que se conserva salvo que el mismo usuario ya tuviera reserva
-- en ambas (en ese caso la reserva duplicada se borra, la real permanece
-- intacta) — nadie pierde una reserva real por esta limpieza.

-- Paso 1: mover reservas "seguras" (usuario sin reserva ya en la fila que se conserva)
WITH ranked AS (
  SELECT id, class_date, class_time, class_type,
         row_number() OVER (PARTITION BY class_date, class_time, class_type ORDER BY created_at ASC, id ASC) AS rn
  FROM classes
),
keepers AS (
  SELECT class_date, class_time, class_type, id AS keeper_id FROM ranked WHERE rn = 1
),
losers AS (
  SELECT r.id AS loser_id, k.keeper_id
  FROM ranked r JOIN keepers k USING (class_date, class_time, class_type)
  WHERE r.rn > 1
)
UPDATE bookings b
SET class_id = l.keeper_id
FROM losers l
WHERE b.class_id = l.loser_id
  AND NOT EXISTS (SELECT 1 FROM bookings b2 WHERE b2.class_id = l.keeper_id AND b2.user_id = b.user_id);

-- Paso 2: borrar reservas que quedaron en una fila duplicada (el usuario ya
-- tenía reserva real en la fila que se conserva, esta es la sobrante)
WITH ranked AS (
  SELECT id, class_date, class_time, class_type,
         row_number() OVER (PARTITION BY class_date, class_time, class_type ORDER BY created_at ASC, id ASC) AS rn
  FROM classes
),
losers AS (
  SELECT id AS loser_id FROM ranked WHERE rn > 1
)
DELETE FROM bookings b
USING losers l
WHERE b.class_id = l.loser_id;

-- Paso 3: ya sin reservas colgando, borrar las filas de clase duplicadas
WITH ranked AS (
  SELECT id, class_date, class_time, class_type,
         row_number() OVER (PARTITION BY class_date, class_time, class_type ORDER BY created_at ASC, id ASC) AS rn
  FROM classes
)
DELETE FROM classes c
USING ranked r
WHERE c.id = r.id AND r.rn > 1;
