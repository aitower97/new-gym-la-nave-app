/**
 * ¿Hay que pasar a este usuario por la pantalla de alta (CompleteProfile)
 * antes de dejarle usar la app? Lógica pura, sin react-native ni supabase,
 * para poder testearla con Jest.
 */

export interface AuthUserLike {
  email?: string | null;
  user_metadata?: Record<string, any> | null;
}

/**
 * Le falta el consentimiento registrado (art. 7.1 RGPD). Pasa con quien entra
 * con Google/Apple, que no pasa por RegisterScreen, y con los socios dados de
 * alta antes de que existiera el formulario. Los admins quedan fuera: son
 * personal del gimnasio, no socios.
 */
export function needsProfileCompletion(user: AuthUserLike | null | undefined, isAdmin: boolean): boolean {
  if (!user || isAdmin) return false;
  return !user.user_metadata?.accepted_terms_at;
}

/**
 * Apple con "Ocultar mi correo": el email es un reenvío de Apple, no el que el
 * socio usa con el gimnasio, así que no se enlaza a una cuenta existente.
 */
export function isApplePrivateRelay(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith('@privaterelay.appleid.com');
}

/**
 * Nombre con el que rellenar el formulario de alta. Google lo manda en
 * full_name/name; Apple solo la primera vez que se autoriza la app, y llega
 * aparte (en la credencial, no en el token), por eso se pasa como fallback.
 */
export function suggestedFullName(user: AuthUserLike | null | undefined, appleName?: string | null): string {
  const meta = user?.user_metadata || {};
  return (meta.full_name || meta.name || appleName || '').trim();
}
