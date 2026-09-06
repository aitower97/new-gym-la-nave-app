/**
 * planCategories.ts — Categorías de planes de socio.
 *
 * `membership_plans.category` es texto libre: el admin puede crear la
 * categoría que quiera desde AdminPlanFormScreen (antes era un enum fijo
 * gym/classes/both). Cada categoría se pinta con un color derivado de su
 * nombre (determinista, sin necesidad de guardar un color en BD) — sin
 * icono/emoji, porque un icono fijo no tiene sentido para un valor abierto.
 */

// Las 3 categorías con las que arrancó la app — se siguen ofreciendo como
// punto de partida, pero ya no son las únicas posibles.
export const LEGACY_CATEGORIES = ['gym', 'classes', 'both'];

const LEGACY_LABELS: Record<string, string> = {
  gym: 'Sala',
  classes: 'Clases',
  both: 'Gym + Clases',
};

const COLOR_PALETTE = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B',
  '#EC4899', '#06B6D4', '#EF4444', '#84CC16',
];

export function categoryLabel(category: string): string {
  return LEGACY_LABELS[category] || category;
}

export function categoryColor(category: string): string {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  }
  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

/** Categorías por defecto + las que ya usa algún plan, sin duplicados. */
export function collectCategories(existing: (string | null | undefined)[]): string[] {
  const set = new Set<string>(LEGACY_CATEGORIES);
  for (const c of existing) {
    if (c) set.add(c);
  }
  return Array.from(set);
}
