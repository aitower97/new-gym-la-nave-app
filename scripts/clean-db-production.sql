-- ============================================================
-- LIMPIEZA BD PRODUCCIÓN — La Nave Strength Center
-- Ejecutar en Supabase Dashboard > SQL Editor
-- Fecha: 2026-06-23
-- ============================================================

-- 1. BORRAR DATOS TRANSACCIONALES (orden por FK)
DELETE FROM admin_actions;
DELETE FROM booking_templates;
DELETE FROM bookings;
DELETE FROM notifications;
DELETE FROM push_tokens;
DELETE FROM workout_logs;
DELETE FROM workout_notes;
DELETE FROM user_memberships;

-- 2. BORRAR CLASES EXISTENTES
DELETE FROM classes;

-- 3. BORRAR EJERCICIOS DE ENTRENAMIENTO
DELETE FROM workout_exercises;

-- 4. CONFIGURAR TIPOS DE CLASE (limpiar y crear los correctos)
DELETE FROM class_types;
INSERT INTO class_types (name) VALUES ('CROSS TRAINING'), ('HALTEROFILIA')
ON CONFLICT DO NOTHING;

-- 5. BORRAR TODOS LOS PERFILES Y ROLES EXCEPTO ADMIN
-- (los usuarios de auth.users se borran manualmente desde Dashboard > Authentication)
DELETE FROM user_roles WHERE user_id NOT IN (
  SELECT id FROM auth.users WHERE email = 'lanavesc@gmail.com'
);
DELETE FROM profiles WHERE id NOT IN (
  SELECT id FROM auth.users WHERE email = 'lanavesc@gmail.com'
);

-- 6. ASEGURAR QUE EL ADMIN TIENE ROL CORRECTO
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'lanavesc@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

-- 7. CREAR CLASES — 8 semanas desde 2026-06-23
-- Lunes, Martes, Jueves, Viernes → CROSS TRAINING
-- Miércoles → HALTEROFILIA
-- Horarios: 10:00, 17:00, 18:00, 19:00, 20:00

DO $$
DECLARE
  d DATE := '2026-06-23';
  end_date DATE := '2026-08-21';
  dow INT;
  t TEXT;
  class_name TEXT;
  class_type TEXT;
  times TEXT[] := ARRAY['10:00:00', '17:00:00', '18:00:00', '19:00:00', '20:00:00'];
BEGIN
  WHILE d <= end_date LOOP
    dow := EXTRACT(DOW FROM d);  -- 0=dom, 1=lun, 2=mar, 3=mie, 4=jue, 5=vie, 6=sab

    IF dow IN (1, 2, 4, 5) THEN
      class_name := 'CROSS TRAINING';
      class_type := 'CROSS TRAINING';
    ELSIF dow = 3 THEN
      class_name := 'HALTEROFILIA';
      class_type := 'HALTEROFILIA';
    ELSE
      d := d + 1;
      CONTINUE;
    END IF;

    FOREACH t IN ARRAY times LOOP
      INSERT INTO classes (name, class_date, class_time, max_spots, class_type)
      VALUES (class_name, d, t::TIME, 10, class_type);
    END LOOP;

    d := d + 1;
  END LOOP;
END $$;

-- 8. VERIFICACIÓN
SELECT 'profiles' AS tabla, COUNT(*) AS registros FROM profiles
UNION ALL SELECT 'user_roles', COUNT(*) FROM user_roles
UNION ALL SELECT 'classes', COUNT(*) FROM classes
UNION ALL SELECT 'bookings', COUNT(*) FROM bookings
UNION ALL SELECT 'class_types', COUNT(*) FROM class_types
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'workout_exercises', COUNT(*) FROM workout_exercises
UNION ALL SELECT 'workout_logs', COUNT(*) FROM workout_logs
UNION ALL SELECT 'membership_plans', COUNT(*) FROM membership_plans
UNION ALL SELECT 'user_memberships', COUNT(*) FROM user_memberships
UNION ALL SELECT 'booking_templates', COUNT(*) FROM booking_templates
ORDER BY tabla;
