-- Evita que vuelva a pasar lo mismo que arregló la migración anterior
-- (77 clases duplicadas por haber creado clases recurrentes dos veces
-- sobre el mismo rango de fechas): un mismo día+hora nunca ha tenido más
-- de un tipo de clase en los datos reales, así que se fuerza a nivel de
-- base de datos que solo pueda existir una clase por franja horaria. Si
-- un admin repite sin querer la creación de clases recurrentes sobre un
-- rango ya cubierto, el insert fallará entero (en vez de duplicar en
-- silencio) y tendrá que revisar el rango.
ALTER TABLE classes
  ADD CONSTRAINT classes_date_time_unique UNIQUE (class_date, class_time);
