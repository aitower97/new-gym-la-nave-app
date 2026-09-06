import { supabase } from '../lib/supabase';

export interface ClassTypeInfo {
  name: string;
  color: string;
}

export const DEFAULT_CLASS_TYPE_COLOR = '#3B82F6';

/** Paleta que se ofrece al admin al crear o recolorear un tipo de clase. */
export const CLASS_TYPE_PALETTE = [
  '#3B82F6', '#0EA5E9', '#06B6D4', '#14B8A6', '#10B981',
  '#84CC16', '#EAB308', '#F59E0B', '#F97316', '#EF4444',
  '#F43F5E', '#EC4899', '#D946EF', '#A855F7', '#8B5CF6', '#6366F1',
];

export async function getClassTypes(): Promise<ClassTypeInfo[]> {
  const { data, error } = await supabase.from('class_types').select('name, color').order('name');
  if (error) throw error;
  return data || [];
}

export function classTypeColorMap(types: ClassTypeInfo[]): Record<string, string> {
  return Object.fromEntries(types.map(t => [t.name, t.color]));
}

export async function createClassType(name: string, color: string): Promise<void> {
  const { error } = await supabase.from('class_types').insert({ name, color });
  if (error) throw error;
}

export async function deleteClassType(name: string): Promise<void> {
  const { error } = await supabase.from('class_types').delete().eq('name', name);
  if (error) throw error;
}

export async function setClassTypeColor(name: string, color: string): Promise<void> {
  const { error } = await supabase.from('class_types').update({ color }).eq('name', name);
  if (error) throw error;
}
