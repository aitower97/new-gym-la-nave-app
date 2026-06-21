-- Allow admins to insert and update workout_logs for any user
CREATE POLICY "Admins can insert workout logs"
  ON workout_logs FOR INSERT
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can update workout logs"
  ON workout_logs FOR UPDATE
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can delete workout logs"
  ON workout_logs FOR DELETE
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
