import { Platform } from 'react-native';
import type { User } from '@supabase/supabase-js';
import { APPLE_AUTH_ENABLED, GOOGLE_AUTH } from '../config/socialAuth';
import { supabase } from '../lib/supabase';

/**
 * Login con Google y Apple usando el SDK nativo de cada uno + signInWithIdToken
 * de Supabase (sin navegador ni deep links). Ver docs/LOGIN-SOCIAL.md.
 *
 * Los módulos nativos se cargan con require() dentro de cada función: así un
 * binario o Expo Go sin ellos no revienta al importar este fichero, solo si
 * alguien pulsa el botón (y los botones no se enseñan sin configurar).
 */

export interface SocialSignInResult {
  user: User;
  /** Nombre que da Apple, solo la primera vez que se autoriza la app. */
  appleName?: string;
}

export const isGoogleConfigured = () => !!GOOGLE_AUTH.webClientId && (Platform.OS !== 'ios' || !!GOOGLE_AUTH.iosClientId);

export async function isAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !APPLE_AUTH_ENABLED) return false;
  try {
    const AppleAuthentication = require('expo-apple-authentication');
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

let googleConfigured = false;

/** null = el usuario canceló. Lanza Error con un mensaje para el usuario si falla. */
export async function signInWithGoogle(): Promise<SocialSignInResult | null> {
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = require('@react-native-google-signin/google-signin');

  if (!googleConfigured) {
    GoogleSignin.configure({
      webClientId: GOOGLE_AUTH.webClientId,
      iosClientId: GOOGLE_AUTH.iosClientId || undefined,
    });
    googleConfigured = true;
  }

  let idToken: string | null | undefined;
  try {
    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null; // cancelado
    idToken = response.data.idToken;
  } catch (error: any) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (error.code === statusCodes.IN_PROGRESS) return null;
      if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Este móvil no tiene Google Play Services actualizado.');
      }
    }
    throw new Error('No se pudo iniciar sesión con Google. Inténtalo de nuevo.');
  }

  if (!idToken) throw new Error('Google no devolvió la identificación. Inténtalo de nuevo.');

  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error || !data.user) throw new Error(error?.message || 'No se pudo iniciar sesión con Google.');
  return { user: data.user };
}

/** null = el usuario canceló. Lanza Error con un mensaje para el usuario si falla. */
export async function signInWithApple(): Promise<SocialSignInResult | null> {
  const AppleAuthentication = require('expo-apple-authentication');

  let credential: any;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (error: any) {
    if (error?.code === 'ERR_REQUEST_CANCELED') return null;
    throw new Error('No se pudo iniciar sesión con Apple. Inténtalo de nuevo.');
  }

  if (!credential?.identityToken) throw new Error('Apple no devolvió la identificación. Inténtalo de nuevo.');

  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
  if (error || !data.user) throw new Error(error?.message || 'No se pudo iniciar sesión con Apple.');

  // Apple no mete el nombre en el token y solo lo da la primera vez: se guarda
  // ya en los metadatos para no perderlo si el socio sale antes de completar el alta.
  const appleName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ').trim();
  let user = data.user;
  if (appleName && !user.user_metadata?.full_name) {
    const { data: updated } = await supabase.auth.updateUser({ data: { full_name: appleName } });
    if (updated.user) user = updated.user;
  }
  return { user, appleName: appleName || undefined };
}

/** Cierra también la sesión de Google, para que la próxima vez deje elegir cuenta. */
export async function signOutFromGoogle(): Promise<void> {
  if (!isGoogleConfigured()) return;
  try {
    const { GoogleSignin } = require('@react-native-google-signin/google-signin');
    await GoogleSignin.signOut();
  } catch {
    // no había sesión de Google o el módulo no está: nada que hacer
  }
}
