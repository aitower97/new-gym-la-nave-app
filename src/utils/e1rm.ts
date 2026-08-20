/**
 * e1rm.ts — Estimación de 1RM a partir de peso, repeticiones y RPE.
 *
 * Usa la tabla RPE de Tuchscherer (Reactive Training Systems): cada
 * combinación reps×RPE corresponde a un % de 1RM. Con RPE conocido esto es
 * mucho más fiel que una fórmula genérica, porque tiene en cuenta lo cerca
 * del fallo que estaba la serie. Sin RPE (o RPE fuera de la tabla) cae a la
 * fórmula de Epley.
 */

// % de 1RM por [reps][rpe] — reps 1-12, RPE 6-10 en pasos de 0.5.
const RPE_TABLE: Record<number, Record<string, number>> = {
  1:  { '10': 100,   '9.5': 97.8,  '9': 95.5,  '8.5': 93.9, '8': 92.2, '7.5': 90.7, '7': 89.2, '6.5': 87.8, '6': 86.3 },
  2:  { '10': 95.5,  '9.5': 93.9,  '9': 92.2,  '8.5': 90.7, '8': 89.2, '7.5': 87.8, '7': 86.3, '6.5': 85,   '6': 83.7 },
  3:  { '10': 92.2,  '9.5': 90.7,  '9': 89.2,  '8.5': 87.8, '8': 86.3, '7.5': 85,   '7': 83.7, '6.5': 82.4, '6': 81.1 },
  4:  { '10': 89.2,  '9.5': 87.8,  '9': 86.3,  '8.5': 85,   '8': 83.7, '7.5': 82.4, '7': 81.1, '6.5': 79.9, '6': 78.6 },
  5:  { '10': 86.3,  '9.5': 85,    '9': 83.7,  '8.5': 82.4, '8': 81.1, '7.5': 79.9, '7': 78.6, '6.5': 77.4, '6': 76.2 },
  6:  { '10': 83.7,  '9.5': 82.4,  '9': 81.1,  '8.5': 79.9, '8': 78.6, '7.5': 77.4, '7': 76.2, '6.5': 75.1, '6': 73.9 },
  7:  { '10': 81.1,  '9.5': 79.9,  '9': 78.6,  '8.5': 77.4, '8': 76.2, '7.5': 75.1, '7': 73.9, '6.5': 72.8, '6': 71.7 },
  8:  { '10': 78.6,  '9.5': 77.4,  '9': 76.2,  '8.5': 75.1, '8': 73.9, '7.5': 72.8, '7': 71.7, '6.5': 70.7, '6': 69.6 },
  9:  { '10': 76.2,  '9.5': 75.1,  '9': 73.9,  '8.5': 72.8, '8': 71.7, '7.5': 70.7, '7': 69.6, '6.5': 68.6, '6': 67.6 },
  10: { '10': 73.9,  '9.5': 72.8,  '9': 71.7,  '8.5': 70.7, '8': 69.6, '7.5': 68.6, '7': 67.6, '6.5': 66.6, '6': 65.6 },
  11: { '10': 71.7,  '9.5': 70.7,  '9': 69.6,  '8.5': 68.6, '8': 67.6, '7.5': 66.6, '7': 65.6, '6.5': 64.7, '6': 63.7 },
  12: { '10': 69.6,  '9.5': 68.6,  '9': 67.6,  '8.5': 66.6, '8': 65.6, '7.5': 64.7, '7': 63.7, '6.5': 62.8, '6': 61.8 },
};

/** Fórmula de Epley — fallback cuando no hay RPE fiable. */
function epley1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

/**
 * Estima el 1RM a partir de un registro (peso, reps, RPE opcional).
 * Con reps > 12 o sin RPE en [6,10], usa Epley.
 */
export function estimate1RM(weight: number | null | undefined, reps: number, rpe: number | null | undefined): number {
  if (!weight || weight <= 0 || !reps || reps <= 0) return 0;

  const repsKey = Math.min(Math.round(reps), 12);
  const rpeRounded = rpe != null ? Math.round(rpe * 2) / 2 : null; // a pasos de 0.5
  const table = RPE_TABLE[repsKey];

  if (table && rpeRounded != null && rpeRounded >= 6 && rpeRounded <= 10) {
    const pct = table[String(rpeRounded)];
    if (pct) return weight / (pct / 100);
  }

  return epley1RM(weight, reps);
}
