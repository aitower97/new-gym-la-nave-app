/**
 * workoutProgress.ts — Cálculo de progreso por ejercicio a partir de los
 * registros (workout_logs). Se usa en la pantalla de entreno del usuario y en
 * la vista de admin para mostrar PR, último peso, tendencia y sparkline.
 */

export interface ExerciseProgress {
  pr: number;              // récord (peso máximo registrado)
  last: number;            // último peso registrado
  prev: number | null;     // peso de la sesión anterior
  delta: number | null;    // last - prev
  count: number;           // nº de sesiones registradas
  isPrLast: boolean;       // el último registro iguala/supera el PR
  series: number[];        // pesos en orden cronológico (reciente al final)
}

interface RawLog {
  exercise_id: string;
  date: string;
  weight: number;
}

/**
 * Agrupa los logs por ejercicio y calcula el resumen de progreso.
 * Espera los logs ordenados por fecha ascendente (los ordena por si acaso).
 */
export function buildProgressMap(logs: RawLog[]): Record<string, ExerciseProgress> {
  const byExercise: Record<string, RawLog[]> = {};
  for (const log of logs) {
    if (log.weight == null) continue;
    (byExercise[log.exercise_id] ||= []).push(log);
  }

  const map: Record<string, ExerciseProgress> = {};
  for (const [exerciseId, entries] of Object.entries(byExercise)) {
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const series = sorted.map((e) => Number(e.weight));
    const pr = Math.max(...series);
    const last = series[series.length - 1];
    const prev = series.length > 1 ? series[series.length - 2] : null;
    map[exerciseId] = {
      pr,
      last,
      prev,
      delta: prev !== null ? last - prev : null,
      count: series.length,
      isPrLast: last >= pr,
      series,
    };
  }
  return map;
}
