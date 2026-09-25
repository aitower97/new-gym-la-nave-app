/**
 * IDs de cliente OAuth de Google (Google Cloud Console → Credentials).
 * No son secretos: viajan dentro de la app de todas formas.
 *
 * Mientras estén vacíos, el botón de Google no se muestra y la app funciona
 * igual que antes. Ver docs/LOGIN-SOCIAL.md.
 *
 * - webClientId: el cliente de tipo "Web". Es el que se configura también en
 *   Supabase → Authentication → Providers → Google, y el que firma el idToken
 *   que Supabase valida.
 * - iosClientId: el cliente de tipo "iOS". Su forma invertida
 *   (com.googleusercontent.apps.XXXX) va además en app.json, como
 *   iosUrlScheme del plugin @react-native-google-signin/google-signin.
 */
export const GOOGLE_AUTH = {
  webClientId: '',
  iosClientId: '',
};

/**
 * Sign in with Apple no necesita IDs aquí (usa el bundle es.lanave.app), pero
 * sí la capacidad activada en Apple Developer y el proveedor en Supabase. Se
 * enciende a mano cuando eso esté hecho, para no enseñar un botón que falla.
 */
export const APPLE_AUTH_ENABLED = false;
