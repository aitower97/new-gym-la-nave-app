/**
 * RPE con medios puntos y rangos: "8", "7,5", "7.5", "7/8", "7-8", "7,5/8,5".
 * En la base de datos es min (rpe / target_rpe / default_rpe) + max opcional
 * (*_max), numeric en pasos de 0,5. Lógica pura para Jest.
 */

export interface RpeValue {
  min: number;
  /** null = valor único; si hay, es un rango min–max ("RPE 7/8") */
  max: number | null;
}

/** Caracteres que se dejan escribir en un campo de RPE. */
export const RPE_INPUT_CHARS = /^[0-9.,/\- ]*$/;
export const RPE_INPUT_MAX_LENGTH = 9; // "7,5 / 8,5"

const RANGE_SEPARATOR = /\s*[/-]\s*/;

function parseSingle(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d{1,2}(\.\d)?$/.test(t)) return null;
  const n = Number(t);
  if (n < 1 || n > 10) return null;
  if (n * 2 !== Math.trunc(n * 2)) return null; // solo enteros y medios
  return n;
}

/**
 * Texto del campo → valor. undefined = campo vacío (sin RPE);
 * null = texto no válido (hay que avisar).
 */
export function parseRpe(text: string | null | undefined): RpeValue | null | undefined {
  const t = (text ?? '').trim();
  if (!t) return undefined;
  const parts = t.split(RANGE_SEPARATOR);
  if (parts.length === 1) {
    const n = parseSingle(parts[0]);
    return n == null ? null : { min: n, max: null };
  }
  if (parts.length !== 2) return null;
  const a = parseSingle(parts[0]);
  const b = parseSingle(parts[1]);
  if (a == null || b == null) return null;
  if (a === b) return { min: a, max: null };
  return a < b ? { min: a, max: b } : { min: b, max: a };
}

/** Mensaje para un RPE no válido, el mismo en todas las pantallas. */
export const RPE_INVALID_MESSAGE = 'El RPE va de 1 a 10, en enteros o medios (7,5), o como rango (7/8).';

function num(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

/** Para mostrar: "8", "7,5", "7/8". Vacío si no hay RPE. */
export function formatRpe(min: number | string | null | undefined, max?: number | string | null): string {
  if (min == null || min === '') return '';
  const a = Number(min);
  if (!Number.isFinite(a) || a <= 0) return '';
  const b = max == null || max === '' ? null : Number(max);
  return b != null && Number.isFinite(b) && b > a ? `${num(a)}/${num(b)}` : num(a);
}

/** Para rellenar un campo editable con lo guardado (mismo formato que se escribe). */
export const rpeToInput = formatRpe;

/**
 * Número para las estimaciones (1RM, medias): un rango cuenta como su punto
 * medio ("7/8" → 7,5). null si no hay RPE.
 */
export function rpeForEstimate(min: number | string | null | undefined, max?: number | string | null): number | null {
  if (min == null || min === '') return null;
  const a = Number(min);
  if (!Number.isFinite(a) || a <= 0) return null;
  const b = max == null || max === '' ? null : Number(max);
  return b != null && Number.isFinite(b) && b > a ? (a + b) / 2 : a;
}
