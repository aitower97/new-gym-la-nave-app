-- El admin pide poder elegir el color de cada tipo de clase (antes venía
-- fijo en el código, y de hecho con 3 mapas de color distintos e
-- inconsistentes entre sí repartidos por la app). Se guarda en la propia
-- tabla class_types para que sea la única fuente de verdad.
ALTER TABLE public.class_types ADD COLUMN color text NOT NULL DEFAULT '#3B82F6';

-- Backfill de los tipos ya existentes, respetando los colores que ya se
-- veían en pantalla salvo por ENDURANCE (antes caía sin querer en el mismo
-- azul que CROSS TRAINING por no estar contemplado en ningún mapa).
UPDATE public.class_types SET color = '#EF4444' WHERE name = 'HALTEROFILIA';
UPDATE public.class_types SET color = '#10B981' WHERE name = 'ENDURANCE';
