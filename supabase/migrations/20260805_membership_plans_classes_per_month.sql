-- El límite de clases de un plan se cuenta por mes, no por semana.
ALTER TABLE membership_plans RENAME COLUMN classes_per_week TO classes_per_month;
