-- El admin decide que cada socio tenga su propia biblioteca de ejercicios
-- SIN acceso a la del entrenador (se había montado como híbrida — global +
-- personal — pero no es lo que quería). Se restringe la lectura: cada socio
-- solo ve sus propias filas; el admin sigue viendo/gestionando todo vía la
-- policy ALL (is_admin()) ya existente, así que su autocompletado al montar
-- el WOD (AdminWorkoutScreen.tsx) no se ve afectado.
DROP POLICY IF EXISTS "Anyone can read exercise library" ON public.exercise_library;
CREATE POLICY "users_read_own_exercise_library" ON public.exercise_library
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
