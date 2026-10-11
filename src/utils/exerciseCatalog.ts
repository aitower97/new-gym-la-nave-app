import { supabase } from '../lib/supabase';

/**
 * Catálogo de ejercicios (migración 20261012120000_exercise_catalog.sql).
 * Oficiales = del entrenador (solo el admin los cambia); propios = de cada
 * socio (solo él los renombra). Las reglas viven en la base de datos: aquí
 * solo se llaman sus funciones.
 */

export interface ExerciseOption {
  id: string;
  name: string;
  is_official: boolean;
}

/** Buscador al añadir un ejercicio: oficiales primero y luego los propios. */
export async function suggestExercises(query: string, limit = 5): Promise<ExerciseOption[]> {
  const { data, error } = await supabase.rpc('suggest_exercises', { p_query: query, p_limit: limit });
  if (error) throw error;
  return (data || []) as ExerciseOption[];
}

export type RenameResult = 'ok' | 'needs_merge' | 'official' | 'not_allowed' | 'not_found' | 'invalid';

export async function renameExerciseById(exerciseId: string, newName: string, merge = false): Promise<RenameResult> {
  const { data, error } = await supabase.rpc('rename_exercise_by_id', {
    p_exercise_id: exerciseId, p_new_name: newName, p_merge: merge,
  });
  if (error) throw error;
  return data as RenameResult;
}

// ── Admin ────────────────────────────────────────────────────────────────

export type ReviewReason = 'nombre' | 'sinonimo' | 'errata' | 'contiene' | 'varios_socios';

export interface ReviewItem {
  /** 'p:<nombre>' = propios de socios con ese nombre · 'o:<id>' = un oficial */
  source_key: string;
  source_name: string;
  source_official: boolean;
  members: number;
  logs: number;
  kind: 'merge' | 'make_official';
  target_id: string | null;
  target_name: string | null;
  reason: ReviewReason;
}

export const REASON_LABEL: Record<ReviewReason, string> = {
  nombre: 'Mismo nombre',
  sinonimo: 'Sinónimo',
  errata: 'Errata',
  contiene: 'Parecido',
  varios_socios: 'Lo usan varios socios',
};

export async function getReviewQueue(): Promise<ReviewItem[]> {
  const { data, error } = await supabase.rpc('exercise_review_queue');
  if (error) throw error;
  return (data || []) as ReviewItem[];
}

async function adminCall(fn: string, args: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  if (data !== 'ok') throw new Error(String(data));
}

/** "Unir": el origen pasa al oficial y su nombre queda como sinónimo. */
export const acceptMerge = (sourceKey: string, targetId: string) =>
  adminCall('admin_accept_exercise_merge', { p_source_key: sourceKey, p_target: targetId });

/** "Hacer oficial": un nombre de socios pasa al catálogo. */
export const makeOfficial = (sourceKey: string, name: string) =>
  adminCall('admin_make_official', { p_source_key: sourceKey, p_name: name });

/** "Son distintos" (con destino) o "dejar como está" (sin destino): no se vuelve a proponer. */
export const dismissReview = (sourceKey: string, targetId: string | null) =>
  adminCall('admin_dismiss_exercise_review', { p_source_key: sourceKey, p_target: targetId });

export const mergeExercises = (sourceId: string, targetId: string) =>
  adminCall('admin_merge_exercises', { p_source: sourceId, p_target: targetId });

export const archiveExercise = (id: string, archived: boolean) =>
  adminCall('admin_archive_exercise', { p_id: id, p_archived: archived });

export interface CatalogExercise {
  id: string;
  name: string;
  archived: boolean;
  /** Socios que lo han registrado alguna vez */
  members: number;
  /** Marcas registradas con él (las que se borran si se elimina) */
  logs: number;
  aliases: string[];
}

/** Oficiales con cuántos socios y marcas tienen, y sus sinónimos (solo admin). */
export async function getCatalog(): Promise<CatalogExercise[]> {
  const { data, error } = await supabase.rpc('exercise_catalog');
  if (error) throw error;
  return (data || []) as CatalogExercise[];
}

export type DeleteResult = 'ok' | 'name_mismatch' | 'not_found' | 'not_allowed';

/**
 * Borra un oficial y, si tiene, las marcas de los socios con él. Hay que pasar
 * su nombre escrito por el admin: la base de datos lo comprueba.
 */
export async function deleteExercise(id: string, confirmName: string): Promise<DeleteResult> {
  const { data, error } = await supabase.rpc('admin_delete_exercise', { p_id: id, p_confirm_name: confirmName });
  if (error) throw error;
  return data as DeleteResult;
}
