/**
 * trainingStats.ts — Agregados semanales (volumen por zona, carga/RPE medio)
 * y comparativa de bloque (e1RM al inicio vs al final de un periodo), al
 * estilo "Block Review" de Reactive Training Systems. Todo se calcula sobre
 * los workout_logs ya cargados; no hace falta ninguna tabla nueva.
 */

import { BodyGroupKey } from './exerciseClassification';
import { estimate1RM } from './e1rm';

export interface StatsLogEntry {
  date: string; // YYYY-MM-DD
  weight: number;
  sets: number;
  reps: number;
  rpe: number | null;
  exerciseName: string;
  group: BodyGroupKey;
}

export interface WeekStats {
  weekStart: string; // lunes de esa semana, YYYY-MM-DD
  label: string;      // "21 jul"
  totalVolume: number;
  byGroup: Partial<Record<BodyGroupKey, number>>;
  avgRpe: number | null;
  sessionDays: number; // nº de días distintos con registro esa semana
}

const MONTH_NAMES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Lunes de la semana ISO a la que pertenece dateStr. */
function mondayOf(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow);
  return toDateStr(d);
}

/**
 * Agrupa por semana (lunes-domingo): volumen total, volumen por zona, RPE
 * medio y nº de días entrenados. Devuelve las últimas `weeks` semanas en
 * orden cronológico (incluye semanas sin registros, con volumen 0).
 */
export function buildWeeklyStats(entries: StatsLogEntry[], weeks = 8): WeekStats[] {
  const byWeek: Record<string, StatsLogEntry[]> = {};
  for (const e of entries) {
    const wk = mondayOf(e.date);
    (byWeek[wk] ||= []).push(e);
  }

  const todayMonday = mondayOf(toDateStr(new Date()));
  const result: WeekStats[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = parseLocalDate(todayMonday);
    d.setDate(d.getDate() - i * 7);
    const weekStart = toDateStr(d);
    const items = byWeek[weekStart] || [];

    const byGroup: Partial<Record<BodyGroupKey, number>> = {};
    let totalVolume = 0;
    let rpeSum = 0;
    let rpeCount = 0;
    const days = new Set<string>();
    for (const e of items) {
      const vol = e.weight * e.reps * e.sets;
      totalVolume += vol;
      byGroup[e.group] = (byGroup[e.group] || 0) + vol;
      if (e.rpe != null) { rpeSum += e.rpe; rpeCount += 1; }
      days.add(e.date);
    }

    result.push({
      weekStart,
      label: `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`,
      totalVolume,
      byGroup,
      avgRpe: rpeCount > 0 ? rpeSum / rpeCount : null,
      sessionDays: days.size,
    });
  }
  return result;
}

export interface BlockReviewItem {
  exerciseName: string;
  group: BodyGroupKey;
  startE1rm: number;
  endE1rm: number;
  delta: number;
  deltaPct: number;
  sessions: number;
}

/**
 * Compara, por ejercicio, el e1RM del primer registro del periodo con el
 * mejor e1RM logrado durante el periodo (equivalente al "gain/loss" del
 * Block Review de RTS). Solo incluye ejercicios con 2+ sesiones en el rango.
 */
export function buildBlockReview(
  entries: StatsLogEntry[],
  periodStart: string,
  periodEnd: string
): BlockReviewItem[] {
  const inRange = entries.filter((e) => e.date >= periodStart && e.date <= periodEnd);

  const byExercise: Record<string, { group: BodyGroupKey; items: StatsLogEntry[] }> = {};
  for (const e of inRange) {
    const key = e.exerciseName.trim().toLowerCase();
    (byExercise[key] ||= { group: e.group, items: [] }).items.push(e);
  }

  const result: BlockReviewItem[] = [];
  for (const { group, items } of Object.values(byExercise)) {
    if (items.length < 2) continue;
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0];
    const startE1rm = estimate1RM(first.weight, first.reps, first.rpe);
    const endE1rm = Math.max(...sorted.map((e) => estimate1RM(e.weight, e.reps, e.rpe)));
    const delta = endE1rm - startE1rm;
    result.push({
      exerciseName: sorted[0].exerciseName,
      group,
      startE1rm,
      endE1rm,
      delta,
      deltaPct: startE1rm > 0 ? (delta / startE1rm) * 100 : 0,
      sessions: sorted.length,
    });
  }

  return result.sort((a, b) => b.delta - a.delta);
}
