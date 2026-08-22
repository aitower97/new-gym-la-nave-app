-- Rellena huecos reales en el horario recurrente (31/07/2026-31/12/2026),
-- detectados al comparar contra el horario real del gimnasio (Cross
-- Training L/M/J/V y Halterofilia X, 10:00/11:00/17:00/18:00/19:00/20:00):
--
-- - Las 11:00 (todos los días) y las 20:00 de miércoles nunca se crearon —
--   la creación de clases recurrentes original (ver admin_actions) no
--   incluyó esas horas en su selección.
-- - Los lunes 10:00/18:00 (desde el 17/08) y los jueves 19:00 (desde el
--   20/08), más un jueves 20:00 suelto (solo el 20/08), existían y luego
--   desaparecieron — probablemente borrados sin querer.
--
-- ON CONFLICT DO NOTHING por seguridad frente a la restricción
-- UNIQUE(class_date, class_time) añadida en la migración anterior, por si
-- alguna de estas franjas ya existiera con otro tipo por error.

INSERT INTO classes (name, class_type, class_date, class_time, max_spots)
SELECT 'CROSS TRAINING', 'CROSS TRAINING', d::date, t.class_time, 10
FROM generate_series('2026-07-31'::date, '2026-12-31'::date, '1 day') d
CROSS JOIN unnest(ARRAY['10:00','11:00','17:00','18:00','19:00','20:00']::time[]) AS t(class_time)
WHERE EXTRACT(ISODOW FROM d) IN (1,2,4,5)
ON CONFLICT (class_date, class_time) DO NOTHING;

INSERT INTO classes (name, class_type, class_date, class_time, max_spots)
SELECT 'HALTEROFILIA', 'HALTEROFILIA', d::date, t.class_time, 10
FROM generate_series('2026-07-31'::date, '2026-12-31'::date, '1 day') d
CROSS JOIN unnest(ARRAY['10:00','11:00','17:00','18:00','19:00','20:00']::time[]) AS t(class_time)
WHERE EXTRACT(ISODOW FROM d) = 3
ON CONFLICT (class_date, class_time) DO NOTHING;
