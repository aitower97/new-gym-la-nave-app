-- La categoría de un plan ahora es texto libre (el admin crea la que
-- quiera desde AdminPlanFormScreen) — la constraint que la limitaba a
-- gym/classes/both ya no aplica.
ALTER TABLE membership_plans DROP CONSTRAINT membership_plans_category_check;
