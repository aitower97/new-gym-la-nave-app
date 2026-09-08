/**
 * workoutSetRows.ts — tipo y helper compartidos entre WorkoutScreen.tsx (el
 * socio registrando su propio entreno) y AdminUserWorkoutScreen.tsx (el
 * admin registrando/editando el de otro usuario) para el registro de varias
 * series de un mismo ejercicio con peso/RPE distintos en la misma sesión.
 */

export interface LocalSetRow {
  /** id real del log (ya guardado) o una clave temporal para una serie sin guardar todavía. */
  key: string;
  dbId: string | null;
  setNumber: number;
  weight: string;
  sets: string;
  reps: string;
  rpe: string;
}

export function emptySetRow(exerciseId: string, setNumber: number): LocalSetRow {
  return { key: `new-${exerciseId}-${setNumber}-${Date.now()}`, dbId: null, setNumber, weight: '', sets: '', reps: '', rpe: '' };
}
