-- Cambiar la capacidad máxima de clases existentes de 15 a 10
-- y establecer el valor por defecto para nuevas clases

UPDATE classes SET max_spots = 10 WHERE max_spots = 15;

-- Opcional: cambiar el default de la columna
ALTER TABLE classes ALTER COLUMN max_spots SET DEFAULT 10;
