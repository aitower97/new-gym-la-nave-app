/**
 * exerciseBlocks.ts — Agrupa ejercicios de una sesión por bloque (ej:
 * Calentamiento, Skills, WOD). El bloque es texto libre por ejercicio
 * (workout_exercises.block_name); no hay tabla aparte. Un ejercicio sin
 * bloque (null/vacío) va en un grupo sin nombre. El orden de los bloques es
 * el de primera aparición dentro de la lista (que ya viene ordenada por
 * sort_order).
 */

export interface ExerciseBlock<T> {
  blockName: string | null;
  items: T[];
}

export function groupByBlock<T extends { block_name?: string | null }>(
  exercises: T[]
): ExerciseBlock<T>[] {
  const order: (string | null)[] = [];
  const displayNameByKey = new Map<string | null, string | null>();
  const byBlock = new Map<string | null, T[]>();

  for (const ex of exercises) {
    const raw = ex.block_name?.trim() || null;
    // Agrupa sin distinguir mayúsculas/minúsculas ("WOD" y "wod" son el
    // mismo bloque); se muestra el nombre tal como se escribió la primera vez.
    const key = raw ? raw.toLowerCase() : null;
    if (!byBlock.has(key)) {
      byBlock.set(key, []);
      displayNameByKey.set(key, raw);
      order.push(key);
    }
    byBlock.get(key)!.push(ex);
  }

  return order.map((key) => ({ blockName: displayNameByKey.get(key)!, items: byBlock.get(key)! }));
}
