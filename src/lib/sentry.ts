import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { resolveSentryEnvironment } from './sentryEnvironment';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

// Mide cada pantalla en el móvil real: cuánto tarda en abrirse, por
// Android/iOS, y los fotogramas lentos o congelados. Sin esto Sentry solo
// veía errores, no la lentitud (noviembre 2026: dos socias en Android).
export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

/** Para el onReady del NavigationContainer. */
export function registerNavigation(ref: unknown) {
  if (!dsn) return;
  navigationIntegration.registerNavigationContainer(ref);
}

// Sin DSN (no configurado en .env / secretos de EAS), todas las funciones
// son no-ops silenciosos — así el resto de la app puede llamarlas siempre
// sin comprobar si Sentry está activo.
export function initSentry() {
  if (!dsn) {
    if (__DEV__) console.log('[Sentry] EXPO_PUBLIC_SENTRY_DSN no configurado — desactivado');
    return;
  }
  Sentry.init({
    dsn,
    environment: resolveSentryEnvironment(__DEV__, Updates.channel),
    release: `gym-app@${Constants.expoConfig?.version ?? 'unknown'}`,
    debug: __DEV__,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    integrations: [navigationIntegration],
    enableNativeFramesTracking: true,
    enableAppStartTracking: true,
  });
}

export function captureError(error: Error, context?: Record<string, any>) {
  if (!dsn) {
    if (__DEV__) console.error('[Sentry:off]', error, context);
    return;
  }
  Sentry.captureException(error, context ? {
    extra: context,
    // Filtrable en Sentry: en qué bloque o pantalla falló
    tags: typeof context.boundary === 'string' ? { boundary: context.boundary } : undefined,
  } : undefined);
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  if (!dsn) return;
  Sentry.captureMessage(message, level);
}

export function addBreadcrumb(message: string, data?: Record<string, any>) {
  if (!dsn) return;
  Sentry.addBreadcrumb({ message, data, timestamp: Date.now() / 1000 });
}

export function identifyUser(userId: string, email?: string, name?: string) {
  if (!dsn) return;
  Sentry.setUser({ id: userId, email, username: name });
}

export function clearUser() {
  if (!dsn) return;
  Sentry.setUser(null);
}
