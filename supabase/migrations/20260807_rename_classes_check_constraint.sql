-- Cosmético: el rename de columna dejó el nombre de la constraint desactualizado.
ALTER TABLE membership_plans RENAME CONSTRAINT membership_plans_classes_per_week_check TO membership_plans_classes_per_month_check;
