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
