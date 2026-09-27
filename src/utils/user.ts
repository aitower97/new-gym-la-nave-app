export function getDisplayName(profile: {
  username?: string | null;
  full_name?: string | null;
  email?: string | null;
}): string {
  return profile.username || profile.full_name || profile.email?.split('@')[0] || 'Usuario';
}

/**
 * Nombre PÚBLICO: lo que ve el resto de usuarios (no admins). Solo el apodo;
 * nunca el nombre completo ni el email. Si no hay apodo, mostramos algo neutro.
 * El nombre completo y el teléfono son datos que solo puede ver el admin.
 */
export function getPublicName(profile: {
  username?: string | null;
}): string {
  return profile.username || 'Usuario';
}

/** "1990-01-31" → "31/01/1990 · 36 años"; sin fecha, "No proporcionada". */
export function formatBirthDateWithAge(iso: string | null, now = new Date()): string {
  if (!iso) return 'No proporcionada';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return 'No proporcionada';
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${dd}/${mm}/${y} · ${age} años`;
}
